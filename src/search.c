#include "ch.h"

#include <limits.h>
#include <stdlib.h>
#include <string.h>

#define SCORE_INFINITY 32000
#define SCORE_MATE 30000

typedef struct {
    transposition_table_t *table;
    move_t killer_moves[MAX_PLY][2];
    int history_scores[PIECE_COUNT][64];
    position_t pv_position;
    uint64_t nodes;
    uint64_t deadline_ms;
    move_t root_best_move;
    bool stop;
} search_context_t;

bool resize_transposition_table_bytes(transposition_table_t *table,
                                      size_t bytes) {
    free_transposition_table(table);
    size_t requested = bytes / sizeof(tt_entry_t);
    if (!requested) return true;
    size_t count = 1;
    while ((count << 1) <= requested) count <<= 1;
    table->entries = calloc(count, sizeof(*table->entries));
    if (!table->entries) return false;
    table->count = count;
    return true;
}

bool resize_transposition_table(transposition_table_t *table,
                                size_t megabytes) {
    return resize_transposition_table_bytes(table, megabytes << 20);
}

void free_transposition_table(transposition_table_t *table) {
    free(table->entries);
    table->entries = NULL;
    table->count = 0;
}

void clear_transposition_table(transposition_table_t *table) {
    if (table->entries) {
        memset(table->entries, 0, table->count * sizeof(*table->entries));
    }
}

static bool position_is_draw(const position_t *position) {
    if (position->halfmove_clock >= 100) return true;
    int end = (int)position->history_count - 1 - position->halfmove_clock;
    if (end < 0) end = 0;
    for (int i = (int)position->history_count - 3; i >= end; i -= 2) {
        if (position->history[i] == position->key) return true;
    }
    return false;
}

static int probe_transposition_table(search_context_t *context,
                                     uint64_t key,
                                     int depth,
                                     int alpha,
                                     int beta,
                                     int ply,
                                     move_t *table_move) {
    if (!context->table || !context->table->count) return SCORE_INFINITY;
    tt_entry_t *entry =
        &context->table->entries[key & (context->table->count - 1)];
    if (entry->key != key) return SCORE_INFINITY;
    *table_move = entry->move;
    int score = entry->score;
    // keep mate score relative to ply
    if (score > SCORE_MATE - MAX_PLY) score -= ply;
    else if (score < -SCORE_MATE + MAX_PLY) score += ply;
    if (entry->depth < depth) return SCORE_INFINITY;
    if (entry->flag == TT_EXACT) return score;
    if (entry->flag == TT_LOWER_BOUND && score >= beta) return score;
    if (entry->flag == TT_UPPER_BOUND && score <= alpha) return score;
    return SCORE_INFINITY;
}

static void store_transposition_entry(search_context_t *context,
                                      uint64_t key,
                                      int depth,
                                      int score,
                                      int flag,
                                      move_t move,
                                      int ply) {
    if (!context->table || !context->table->count) return;
    tt_entry_t *entry =
        &context->table->entries[key & (context->table->count - 1)];
    int stored_depth = depth > INT8_MAX ? INT8_MAX : depth;
    if (entry->key == key && entry->depth > stored_depth &&
        flag != TT_EXACT) return;
    int stored_score = score;
    // keep mate score relative to ply
    if (stored_score > SCORE_MATE - MAX_PLY) stored_score += ply;
    else if (stored_score < -SCORE_MATE + MAX_PLY) stored_score -= ply;
    entry->key = key;
    entry->move = move;
    entry->score = (int16_t)stored_score;
    entry->depth = (int8_t)stored_depth;
    entry->flag = (uint8_t)flag;
}

static void count_node(search_context_t *context) {
    ++context->nodes;
    if ((context->nodes & 2047u) == 0 &&
        context->deadline_ms &&
        current_time_ms() >= context->deadline_ms) {
        context->stop = true;
    }
}

static int score_move(search_context_t *context,
                      const position_t *position,
                      move_t move,
                      move_t table_move,
                      int ply) {
    if (move == table_move) return 2000000000;
    int flags = MOVE_FLAGS(move);
    int promotion = MOVE_PROMOTION(move);
    if (flags & MOVE_CAPTURE) {
        int captured = (flags & MOVE_EN_PASSANT)
                           ? (position->side_to_move == WHITE
                                  ? BLACK_PAWN
                                  : WHITE_PAWN)
                           : position->board[MOVE_TO(move)];
        int piece = position->board[MOVE_FROM(move)];
        return 1000000 + piece_type(captured) * 32 - piece_type(piece) +
               promotion * 128;
    }
    if (promotion) return 900000 + promotion * 128;
    if (context->killer_moves[ply][0] == move) return 800000;
    if (context->killer_moves[ply][1] == move) return 700000;
    int piece = position->board[MOVE_FROM(move)];
    return context->history_scores[piece][MOVE_TO(move)];
}

static void select_next_move(search_context_t *context,
                             const position_t *position,
                             move_list_t *list,
                             int index,
                             move_t table_move,
                             int ply) {
    int best_index = index;
    int best_score =
        score_move(context, position, list->moves[index], table_move, ply);
    for (int i = index + 1; i < list->count; ++i) {
        int score = score_move(context, position, list->moves[i],
                               table_move, ply);
        if (score > best_score) {
            best_score = score;
            best_index = i;
        }
    }
    move_t move = list->moves[index];
    list->moves[index] = list->moves[best_index];
    list->moves[best_index] = move;
}

static int quiescence_search(search_context_t *context,
                             position_t *position,
                             int alpha,
                             int beta,
                             int ply) {
    count_node(context);
    if (context->stop) return 0;
    if (ply >= MAX_PLY - 1) return evaluate(position);
    if (position_is_draw(position)) return 0;
    bool in_check = side_in_check(position, position->side_to_move);
    if (!in_check) {
        int score = evaluate(position);
        if (score >= beta) return score;
        if (score > alpha) alpha = score;
    }

    move_list_t list;
    bool tactical_only = !in_check;
    generate_moves(position, &list, tactical_only);
    int legal_moves = 0;
    for (int i = 0; i < list.count; ++i) {
        select_next_move(context, position, &list, i, 0, ply);
        undo_t undo;
        if (!make_move(position, list.moves[i], &undo)) continue;
        ++legal_moves;
        int score =
            -quiescence_search(context, position, -beta, -alpha, ply + 1);
        undo_move(position, list.moves[i], &undo);
        if (context->stop) return 0;
        if (score >= beta) return score;
        if (score > alpha) alpha = score;
    }
    if (in_check && !legal_moves) return -SCORE_MATE + ply;
    return alpha;
}

static int principal_variation_search(search_context_t *context,
                                      position_t *position,
                                      int depth,
                                      int alpha,
                                      int beta,
                                      int ply) {
    count_node(context);
    if (context->stop) return 0;
    if (ply >= MAX_PLY - 1) return evaluate(position);
    if (position_is_draw(position)) return 0;

    bool in_check = side_in_check(position, position->side_to_move);
    if (in_check) ++depth;
    if (depth <= 0) {
        return quiescence_search(context, position, alpha, beta, ply);
    }

    int original_alpha = alpha;
    move_t table_move = 0;
    int table_score = probe_transposition_table(
        context, position->key, depth, alpha, beta, ply, &table_move);
    if (table_score != SCORE_INFINITY && ply) return table_score;

    move_list_t list;
    generate_moves(position, &list, false);
    move_t best_move = 0;
    int best_score = -SCORE_INFINITY;
    int legal_moves = 0;

    for (int i = 0; i < list.count; ++i) {
        select_next_move(context, position, &list, i, table_move, ply);
        move_t move = list.moves[i];
        bool quiet = !(MOVE_FLAGS(move) & MOVE_CAPTURE) &&
                     !MOVE_PROMOTION(move);
        undo_t undo;
        if (!make_move(position, move, &undo)) continue;
        bool gives_check = side_in_check(position, position->side_to_move);
        int score;
        if (!legal_moves) {
            score = -principal_variation_search(
                context, position, depth - 1, -beta, -alpha, ply + 1);
        } else {
            // reduce late quiet moves
            int reduction = depth >= 3 && legal_moves >= 4 && quiet &&
                            !in_check && !gives_check;
            score = -principal_variation_search(
                context, position, depth - 1 - reduction,
                -alpha - 1, -alpha, ply + 1);
            if (!context->stop && reduction && score > alpha) {
                score = -principal_variation_search(
                    context, position, depth - 1,
                    -alpha - 1, -alpha, ply + 1);
            }
            if (!context->stop && score > alpha && score < beta) {
                score = -principal_variation_search(
                    context, position, depth - 1, -beta, -alpha, ply + 1);
            }
        }
        undo_move(position, move, &undo);
        if (context->stop) return 0;
        ++legal_moves;

        if (score > best_score) {
            best_score = score;
            best_move = move;
        }
        if (score > alpha) {
            alpha = score;
        }
        if (alpha >= beta) {
            if (quiet) {
                if (context->killer_moves[ply][0] != move) {
                    context->killer_moves[ply][1] =
                        context->killer_moves[ply][0];
                    context->killer_moves[ply][0] = move;
                }
                int piece = position->board[MOVE_FROM(move)];
                int *history_score =
                    &context->history_scores[piece][MOVE_TO(move)];
                *history_score += depth * depth;
                if (*history_score > 1000000) {
                    for (int history_piece = 0;
                         history_piece < PIECE_COUNT;
                         ++history_piece) {
                        for (int square = 0; square < 64; ++square) {
                            context->history_scores[history_piece][square] >>= 1;
                        }
                    }
                }
            }
            break;
        }
    }

    if (!legal_moves) return in_check ? -SCORE_MATE + ply : 0;
    int flag = best_score <= original_alpha
                   ? TT_UPPER_BOUND
                   : best_score >= beta ? TT_LOWER_BOUND : TT_EXACT;
    store_transposition_entry(context, position->key, depth, best_score,
                              flag, best_move, ply);
    if (!ply) context->root_best_move = best_move;
    return best_score;
}

static bool make_principal_variation_move(position_t *position, move_t move) {
    move_list_t list;
    generate_moves(position, &list, false);
    for (int i = 0; i < list.count; ++i) {
        if (list.moves[i] != move) continue;
        undo_t undo;
        return make_move(position, move, &undo);
    }
    return false;
}

static int reconstruct_principal_variation(position_t *line,
                                           const transposition_table_t *table,
                                           move_t first_move,
                                           move_t variation[MAX_PLY]) {
    if (!first_move) return 0;
    move_t move = first_move;
    int count = 0;
    while (move && count < MAX_PLY) {
        if (!make_principal_variation_move(line, move)) break;
        variation[count++] = move;
        if (position_is_draw(line) || !table || !table->count) break;
        const tt_entry_t *entry =
            &table->entries[line->key & (table->count - 1)];
        if (entry->key != line->key) break;
        move = entry->move;
    }
    return count;
}

search_result_t search_position(position_t *position,
                                transposition_table_t *table,
                                search_limits_t limits,
                                search_info_fn info,
                                void *context_argument) {
    search_result_t result;
    memset(&result, 0, sizeof(result));
    search_context_t *context = calloc(1, sizeof(*context));
    if (!context) return result;
    context->table = table;
    uint64_t start_ms = current_time_ms();
    context->deadline_ms = limits.move_time_ms
                               ? start_ms + limits.move_time_ms
                               : 0;
    int max_depth = limits.depth > 0 ? limits.depth : 64;
    if (max_depth >= MAX_PLY) max_depth = MAX_PLY - 1;

    for (int depth = 1; depth <= max_depth; ++depth) {
        context->root_best_move = 0;
        int score = principal_variation_search(
            context, position, depth, -SCORE_INFINITY, SCORE_INFINITY, 0);
        if (context->stop) break;
        result.score = score;
        result.depth = depth;
        result.nodes = context->nodes;
        result.best_move = context->root_best_move;
        context->pv_position = *position;
        result.pv_count = reconstruct_principal_variation(
            &context->pv_position, table, result.best_move, result.pv);
        result.elapsed_ms = current_time_ms() - start_ms;
        if (info) info(&result, context_argument);
        if (score > SCORE_MATE - MAX_PLY ||
            score < -SCORE_MATE + MAX_PLY) break;
    }

    if (!result.best_move) {
        move_list_t list;
        generate_moves(position, &list, false);
        for (int i = 0; i < list.count; ++i) {
            undo_t undo;
            if (!make_move(position, list.moves[i], &undo)) continue;
            undo_move(position, list.moves[i], &undo);
            result.best_move = list.moves[i];
            result.pv[0] = result.best_move;
            result.pv_count = 1;
            break;
        }
    }
    result.nodes = context->nodes;
    result.elapsed_ms = current_time_ms() - start_ms;
    free(context);
    return result;
}
