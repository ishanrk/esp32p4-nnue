#include "ch.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int test_failed;

static const int bishop_steps[4][2] = {
    {1, 1}, {-1, 1}, {1, -1}, {-1, -1}
};
static const int rook_steps[4][2] = {
    {0, 1}, {0, -1}, {1, 0}, {-1, 0}
};
static const int sliding_steps[8][2] = {
    {1, 1}, {-1, 1}, {1, -1}, {-1, -1},
    {0, 1}, {0, -1}, {1, 0}, {-1, 0}
};

static void expect_u64(const char *name, uint64_t actual, uint64_t expected) {
    if (actual == expected) return;
    fprintf(stderr, "%s got %llu want %llu\n", name,
            (unsigned long long)actual, (unsigned long long)expected);
    test_failed = 1;
}

static void expect_true(const char *name, bool value) {
    if (value) return;
    fprintf(stderr, "%s failed\n", name);
    test_failed = 1;
}

static void expect_text(const char *name,
                        const char *actual,
                        const char *expected) {
    if (!strcmp(actual, expected)) return;
    fprintf(stderr, "%s got %s want %s\n", name, actual, expected);
    test_failed = 1;
}

static void expect_memory(const char *name,
                          const void *actual,
                          const void *expected,
                          size_t size) {
    if (!memcmp(actual, expected, size)) return;
    fprintf(stderr, "%s differs\n", name);
    test_failed = 1;
}

static bitboard_t walk_attacks(int square,
                               bitboard_t occupancy,
                               const int steps[][2],
                               int step_count) {
    bitboard_t attacks = 0;
    for (int direction = 0; direction < step_count; ++direction) {
        int file = square & 7;
        int rank = square >> 3;
        for (;;) {
            file += steps[direction][0];
            rank += steps[direction][1];
            if ((unsigned)file > 7u || (unsigned)rank > 7u) break;
            bitboard_t target = SQUARE_BIT(MAKE_SQUARE(file, rank));
            attacks |= target;
            if (occupancy & target) break;
        }
    }
    return attacks;
}

static bitboard_t coordinate_attacks(int square,
                                     const int steps[][2],
                                     int step_count) {
    bitboard_t attacks = 0;
    int file = square & 7;
    int rank = square >> 3;
    for (int i = 0; i < step_count; ++i) {
        int target_file = file + steps[i][0];
        int target_rank = rank + steps[i][1];
        if ((unsigned)target_file < 8u && (unsigned)target_rank < 8u) {
            attacks |= SQUARE_BIT(MAKE_SQUARE(target_file, target_rank));
        }
    }
    return attacks;
}

static void check_sliding_attacks(int square, bitboard_t occupancy) {
    bitboard_t bishop = generate_bishop_attacks(square, occupancy);
    bitboard_t rook = generate_rook_attacks(square, occupancy);
    expect_u64("bishop attacks", bishop,
               walk_attacks(square, occupancy, bishop_steps, 4));
    expect_u64("rook attacks", rook,
               walk_attacks(square, occupancy, rook_steps, 4));
    expect_u64("queen attacks", bishop | rook,
               walk_attacks(square, occupancy, sliding_steps, 8));
}

static bitboard_t blockers_at_distance(int square, int distance) {
    bitboard_t blockers = 0;
    for (int direction = 0; direction < 8; ++direction) {
        int file = square & 7;
        int rank = square >> 3;
        for (int i = 0; i < distance; ++i) {
            file += sliding_steps[direction][0];
            rank += sliding_steps[direction][1];
            if ((unsigned)file > 7u || (unsigned)rank > 7u) break;
            if (i == distance - 1) {
                blockers |= SQUARE_BIT(MAKE_SQUARE(file, rank));
            }
        }
    }
    return blockers;
}

static bitboard_t distant_blockers(int square) {
    bitboard_t blockers = 0;
    for (int direction = 0; direction < 8; ++direction) {
        int file = square & 7;
        int rank = square >> 3;
        int last_square = NO_SQUARE;
        for (;;) {
            file += sliding_steps[direction][0];
            rank += sliding_steps[direction][1];
            if ((unsigned)file > 7u || (unsigned)rank > 7u) break;
            last_square = MAKE_SQUARE(file, rank);
        }
        if (last_square != NO_SQUARE) blockers |= SQUARE_BIT(last_square);
    }
    return blockers;
}

static uint64_t next_test_bits(uint64_t *state) {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    return *state;
}

static void test_attacks(void) {
    static const int knight_steps[8][2] = {
        {1, 2}, {2, 1}, {2, -1}, {1, -2},
        {-1, -2}, {-2, -1}, {-2, 1}, {-1, 2}
    };
    static const int king_steps[8][2] = {
        {-1, -1}, {0, -1}, {1, -1}, {-1, 0},
        {1, 0}, {-1, 1}, {0, 1}, {1, 1}
    };
    static const int white_pawn_steps[2][2] = {{-1, 1}, {1, 1}};
    static const int black_pawn_steps[2][2] = {{-1, -1}, {1, -1}};
    static const bitboard_t fixed_occupancies[] = {
        UINT64_C(0),
        UINT64_MAX,
        UINT64_C(0xff000000000000ff),
        UINT64_C(0x8181818181818181),
        UINT64_C(0xff818181818181ff),
        UINT64_C(0x0000001818000000),
        UINT64_C(0xaa55aa55aa55aa55),
        UINT64_C(0x55aa55aa55aa55aa)
    };
    uint64_t random_state = UINT64_C(0x626f617264746573);

    for (int square = 0; square < 64; ++square) {
        expect_u64("white pawn attacks", pawn_attacks[WHITE][square],
                   coordinate_attacks(square, white_pawn_steps, 2));
        expect_u64("black pawn attacks", pawn_attacks[BLACK][square],
                   coordinate_attacks(square, black_pawn_steps, 2));
        expect_u64("knight attacks", knight_attacks[square],
                   coordinate_attacks(square, knight_steps, 8));
        expect_u64("king attacks", king_attacks[square],
                   coordinate_attacks(square, king_steps, 8));

        for (size_t i = 0; i < sizeof(fixed_occupancies) /
                                      sizeof(fixed_occupancies[0]); ++i) {
            check_sliding_attacks(square, fixed_occupancies[i]);
        }
        check_sliding_attacks(square, SQUARE_BIT(square));
        check_sliding_attacks(square, blockers_at_distance(square, 1));
        check_sliding_attacks(square, blockers_at_distance(square, 2));
        check_sliding_attacks(square,
                              blockers_at_distance(square, 1) |
                              blockers_at_distance(square, 2));
        check_sliding_attacks(square, distant_blockers(square));
        for (int i = 0; i < 16; ++i) {
            check_sliding_attacks(square, next_test_bits(&random_state));
        }
    }
}

static void test_fen_loading(void) {
    position_t position;
    set_start_position(&position);
    expect_true("start position valid", position_is_valid(&position));
    expect_u64("start side", position.side_to_move, WHITE);
    expect_u64("start castling", position.castling,
               CASTLE_WHITE_KING | CASTLE_WHITE_QUEEN |
               CASTLE_BLACK_KING | CASTLE_BLACK_QUEEN);
    expect_u64("start en passant", position.en_passant, NO_SQUARE);
    expect_u64("start halfmove", position.halfmove_clock, 0);
    expect_u64("start fullmove", position.fullmove_number, 1);

    expect_true("black fen", set_position_fen(
        &position, "4k3/8/8/8/4P3/8/8/4K3 b - e3 17 42"));
    expect_u64("black side", position.side_to_move, BLACK);
    expect_u64("no castling", position.castling, 0);
    expect_u64("valid en passant", position.en_passant, MAKE_SQUARE(4, 2));
    expect_u64("fen halfmove", position.halfmove_clock, 17);
    expect_u64("fen fullmove", position.fullmove_number, 42);
    expect_true("black position valid", position_is_valid(&position));

    expect_true("white fen", set_position_fen(
        &position, "4k3/8/8/3pP3/8/8/8/4K3 w - d6 9 27"));
    expect_u64("white side", position.side_to_move, WHITE);
    expect_u64("white en passant", position.en_passant, MAKE_SQUARE(3, 5));

    expect_true("bad board width", !set_position_fen(
        &position, "4k2/8/8/8/8/8/8/4K3 w - - 0 1"));
    expect_true("too many ranks", !set_position_fen(
        &position, "4k3/8/8/8/8/8/8/8/4K3 w - - 0 1"));
    expect_true("too few ranks", !set_position_fen(
        &position, "4k3/8/8/8/8/8/4K3 w - - 0 1"));
    expect_true("invalid piece", !set_position_fen(
        &position, "4k3/8/8/8/8/8/8/3XK3 w - - 0 1"));
    expect_true("missing king", !set_position_fen(
        &position, "8/8/8/8/8/8/8/4K3 w - - 0 1"));
    expect_true("invalid side", !set_position_fen(
        &position, "4k3/8/8/8/8/8/8/4K3 x - - 0 1"));
    expect_true("invalid en passant file", !set_position_fen(
        &position, "4k3/8/8/8/8/8/8/4K3 w - i6 0 1"));
    expect_true("invalid en passant rank", !set_position_fen(
        &position, "4k3/8/8/8/8/8/8/4K3 w - d4 0 1"));
    expect_true("invalid en passant pawn", !set_position_fen(
        &position, "4k3/8/8/8/8/8/8/4K3 w - d6 0 1"));
    expect_true("invalid en passant suffix", !set_position_fen(
        &position, "4k3/8/8/8/8/8/8/4K3 w - d6x 0 1"));
    expect_true("invalid zero run", !set_position_fen(
        &position, "4k3/8/8/8/8/8/8/4K03 w - - 0 1"));
}

static void expect_position_state(const position_t *position,
                                  const position_t *expected) {
    expect_memory("piece bitboards", position->pieces, expected->pieces,
                  sizeof(position->pieces));
    expect_memory("occupancy", position->occupancy, expected->occupancy,
                  sizeof(position->occupancy));
    expect_memory("square lookup", position->board, expected->board,
                  sizeof(position->board));
    expect_u64("restored side", position->side_to_move,
               expected->side_to_move);
    expect_u64("restored castling", position->castling, expected->castling);
    expect_u64("restored en passant", position->en_passant,
               expected->en_passant);
    expect_u64("restored halfmove", position->halfmove_clock,
               expected->halfmove_clock);
    expect_u64("restored fullmove", position->fullmove_number,
               expected->fullmove_number);
    expect_u64("restored hash", position->key, expected->key);
    expect_u64("restored history count", position->history_count,
               expected->history_count);
}

static move_t find_generated_move(const position_t *position,
                                  const char *text,
                                  bool tactical_only) {
    move_list_t list;
    generate_moves(position, &list, tactical_only);
    for (int i = 0; i < list.count; ++i) {
        char generated_text[6];
        move_to_uci(list.moves[i], generated_text);
        if (!strcmp(generated_text, text)) return list.moves[i];
    }
    return 0;
}

static bool make_uci_test_move(const char *name,
                               position_t *position,
                               const char *text,
                               move_t *move,
                               undo_t *undo) {
    position_t before_parse = *position;
    *move = parse_uci_move(position, text);
    expect_true(name, *move != 0);
    expect_position_state(position, &before_parse);
    if (!*move) return false;
    char formatted[6];
    move_to_uci(*move, formatted);
    expect_text("uci round trip", formatted, text);
    bool made = make_move(position, *move, undo);
    expect_true("legal move made", made);
    if (!made) return false;
    expect_true("valid position after move", position_is_valid(position));
    expect_u64("side after move", position->side_to_move,
               before_parse.side_to_move ^ 1);
    expect_u64("fullmove after move", position->fullmove_number,
               before_parse.fullmove_number +
               (before_parse.side_to_move == BLACK ? 1u : 0u));
    uint16_t expected_history = before_parse.history_count;
    if (expected_history < POSITION_HISTORY_SIZE) ++expected_history;
    expect_u64("history after move", position->history_count,
               expected_history);
    expect_u64("incremental hash after move", position->key,
               calculate_position_hash(position));
    return true;
}

static void finish_move_test(position_t *position,
                             const position_t *initial,
                             move_t move,
                             const undo_t *undo) {
    undo_move(position, move, undo);
    expect_true("valid position after special undo", position_is_valid(position));
    expect_position_state(position, initial);
}

static void expect_generated_move_rejected(const char *name,
                                           const char *fen,
                                           const char *text) {
    position_t position;
    expect_true(name, set_position_fen(&position, fen));
    position_t initial = position;
    move_t move = find_generated_move(&position, text, false);
    expect_true("rejected candidate generated", move != 0);
    if (!move) return;
    undo_t undo;
    expect_true("candidate rejected", !make_move(&position, move, &undo));
    expect_true("valid position after rejection", position_is_valid(&position));
    expect_position_state(&position, &initial);
}

static void expect_packed_move_rejected(const char *name,
                                        const char *fen,
                                        move_t move) {
    position_t position;
    expect_true(name, set_position_fen(&position, fen));
    position_t initial = position;
    undo_t undo;
    expect_true("packed move rejected", !make_move(&position, move, &undo));
    expect_true("valid position after packed rejection",
                position_is_valid(&position));
    expect_position_state(&position, &initial);
}

static void test_move_encoding(void) {
    move_t move = PACK_MOVE(MAKE_SQUARE(4, 6), MAKE_SQUARE(5, 7),
                            3, MOVE_CAPTURE);
    expect_u64("encoded source", MOVE_FROM(move), MAKE_SQUARE(4, 6));
    expect_u64("encoded destination", MOVE_TO(move), MAKE_SQUARE(5, 7));
    expect_u64("encoded promotion", MOVE_PROMOTION(move), 3);
    expect_u64("encoded flags", MOVE_FLAGS(move), MOVE_CAPTURE);

    static const char promotion_text[4][6] = {
        "a7a8n", "a7a8b", "a7a8r", "a7a8q"
    };
    for (int promotion = 1; promotion <= 4; ++promotion) {
        char text[6];
        move_to_uci(PACK_MOVE(MAKE_SQUARE(0, 6), MAKE_SQUARE(0, 7),
                              promotion, 0), text);
        expect_text("promotion uci", text, promotion_text[promotion - 1]);
    }

    position_t position;
    set_start_position(&position);
    move = parse_uci_move(&position, "e2e4");
    expect_true("normal uci parse", move != 0);
    char text[6];
    move_to_uci(move, text);
    expect_text("normal uci round trip", text, "e2e4");
}

static void test_tactical_generation(void) {
    position_t position;
    move_list_t list;
    set_start_position(&position);
    generate_moves(&position, &list, true);
    expect_u64("start tactical moves", list.count, 0);

    expect_true("tactical promotion fen", set_position_fen(
        &position, "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"));
    generate_moves(&position, &list, true);
    expect_u64("quiet tactical promotions", list.count, 4);
    expect_true("tactical queen promotion",
                find_generated_move(&position, "a7a8q", true) != 0);
    expect_true("tactical rook promotion",
                find_generated_move(&position, "a7a8r", true) != 0);
    expect_true("tactical bishop promotion",
                find_generated_move(&position, "a7a8b", true) != 0);
    expect_true("tactical knight promotion",
                find_generated_move(&position, "a7a8n", true) != 0);

    expect_true("tactical en passant fen", set_position_fen(
        &position, "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1"));
    expect_true("tactical en passant",
                find_generated_move(&position, "e5d6", true) != 0);
}

static void test_castle_case(const char *name,
                             const char *fen,
                             const char *text,
                             int king_piece,
                             int king_to,
                             int rook_piece,
                             int rook_from,
                             int rook_to) {
    position_t position;
    expect_true(name, set_position_fen(&position, fen));
    position_t initial = position;
    move_t move;
    undo_t undo;
    if (!make_uci_test_move(name, &position, text, &move, &undo)) return;
    expect_u64("castle flag", MOVE_FLAGS(move), MOVE_CASTLE);
    expect_u64("castled king", position.board[king_to], king_piece);
    expect_u64("castled rook", position.board[rook_to], rook_piece);
    expect_u64("empty king source", position.board[MOVE_FROM(move)], NO_PIECE);
    expect_u64("empty rook source", position.board[rook_from], NO_PIECE);
    expect_u64("castling rights after castle", position.castling, 0);
    expect_u64("halfmove after castle", position.halfmove_clock,
               initial.halfmove_clock + 1u);
    finish_move_test(&position, &initial, move, &undo);
}

static void test_castling(void) {
    test_castle_case(
        "white king castle",
        "4k3/8/8/8/8/8/8/4K2R w K - 7 12",
        "e1g1", WHITE_KING, 6, WHITE_ROOK, 7, 5);
    test_castle_case(
        "white queen castle",
        "1r2k3/8/8/8/8/8/8/R3K3 w Q - 7 12",
        "e1c1", WHITE_KING, 2, WHITE_ROOK, 0, 3);
    test_castle_case(
        "black king castle",
        "4k2r/8/8/8/8/8/8/4K3 b k - 7 12",
        "e8g8", BLACK_KING, 62, BLACK_ROOK, 63, 61);
    test_castle_case(
        "black queen castle",
        "r3k3/8/8/8/8/8/8/1R2K3 b q - 7 12",
        "e8c8", BLACK_KING, 58, BLACK_ROOK, 56, 59);

    expect_generated_move_rejected(
        "castle while in check",
        "k3r3/8/8/8/8/8/8/4K2R w K - 0 1", "e1g1");
    expect_generated_move_rejected(
        "castle through attack",
        "k4r2/8/8/8/8/8/8/4K2R w K - 0 1", "e1g1");
    expect_generated_move_rejected(
        "castle into attack",
        "k5r1/8/8/8/8/8/8/4K2R w K - 0 1", "e1g1");
    expect_packed_move_rejected(
        "castle without rook",
        "4k3/8/8/8/8/8/8/4K3 w K - 0 1",
        PACK_MOVE(4, 6, 0, MOVE_CASTLE));
    expect_packed_move_rejected(
        "castle without right",
        "4k3/8/8/8/8/8/8/4K2R w - - 0 1",
        PACK_MOVE(4, 6, 0, MOVE_CASTLE));
}

static void test_en_passant(void) {
    position_t position;
    expect_true("legal en passant fen", set_position_fen(
        &position, "4k3/8/8/3pP3/8/8/8/4K3 w - d6 3 17"));
    position_t initial = position;
    move_t move;
    undo_t undo;
    if (make_uci_test_move("legal en passant", &position, "e5d6",
                           &move, &undo)) {
        expect_u64("en passant flags", MOVE_FLAGS(move),
                   MOVE_CAPTURE | MOVE_EN_PASSANT);
        expect_u64("en passant pawn destination", position.board[43],
                   WHITE_PAWN);
        expect_u64("en passant captured square", position.board[35],
                   NO_PIECE);
        expect_u64("en passant halfmove", position.halfmove_clock, 0);
        finish_move_test(&position, &initial, move, &undo);
    }

    expect_generated_move_rejected(
        "en passant exposes king",
        "k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", "e5d6");
}

static void test_promotion_case(const char *name,
                                const char *fen,
                                const char *text,
                                int promotion,
                                int placed_piece,
                                int expected_flags) {
    position_t position;
    expect_true(name, set_position_fen(&position, fen));
    position_t initial = position;
    expect_true("promotion in tactical list",
                find_generated_move(&position, text, true) != 0);
    move_t move;
    undo_t undo;
    if (!make_uci_test_move(name, &position, text, &move, &undo)) return;
    expect_u64("promotion selector", MOVE_PROMOTION(move), promotion);
    expect_u64("promotion flags", MOVE_FLAGS(move), expected_flags);
    expect_u64("promoted piece", position.board[MOVE_TO(move)], placed_piece);
    expect_u64("promotion source empty", position.board[MOVE_FROM(move)],
               NO_PIECE);
    expect_u64("promotion halfmove", position.halfmove_clock, 0);
    finish_move_test(&position, &initial, move, &undo);
}

static void test_promotions(void) {
    const char *white_fen = "4k3/P7/8/8/8/8/8/4K3 w - - 4 11";
    test_promotion_case("quiet queen promotion", white_fen, "a7a8q",
                        4, WHITE_QUEEN, 0);
    test_promotion_case("quiet rook promotion", white_fen, "a7a8r",
                        3, WHITE_ROOK, 0);
    test_promotion_case("quiet bishop promotion", white_fen, "a7a8b",
                        2, WHITE_BISHOP, 0);
    test_promotion_case("quiet knight promotion", white_fen, "a7a8n",
                        1, WHITE_KNIGHT, 0);
    test_promotion_case(
        "black promotion",
        "4K3/8/8/8/8/8/7p/4k3 b - - 4 11", "h2h1n",
        1, BLACK_KNIGHT, 0);
    test_promotion_case(
        "capture promotion",
        "1r2k3/P7/8/8/8/8/8/4K3 w - - 4 11", "a7b8q",
        4, WHITE_QUEEN, MOVE_CAPTURE);
}

static void test_legality_filter(void) {
    expect_generated_move_rejected(
        "pinned piece",
        "k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1", "e2f2");
    expect_generated_move_rejected(
        "king into attack",
        "k4r2/8/8/8/8/8/8/4K3 w - - 0 1", "e1f1");

    position_t position;
    expect_true("check evasion fen", set_position_fen(
        &position, "k3r3/8/8/8/8/8/8/4K3 w - - 0 1"));
    position_t initial = position;
    move_t move;
    undo_t undo;
    if (make_uci_test_move("legal check evasion", &position, "e1d1",
                           &move, &undo)) {
        finish_move_test(&position, &initial, move, &undo);
    }

    expect_generated_move_rejected(
        "non evasion while in check",
        "k3r3/8/8/8/8/8/8/R3K3 w - - 0 1", "a1a2");
}

static void test_castling_rights(void) {
    position_t position;
    expect_true("rook move rights fen", set_position_fen(
        &position, "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1"));
    position_t initial = position;
    move_t move;
    undo_t undo;
    if (make_uci_test_move("rook move rights", &position, "h1h2",
                           &move, &undo)) {
        expect_u64("rook move clears right", position.castling,
                   CASTLE_WHITE_QUEEN);
        finish_move_test(&position, &initial, move, &undo);
    }

    expect_true("rook capture rights fen", set_position_fen(
        &position, "r3k3/8/8/8/8/8/6B1/4K3 w q - 0 1"));
    initial = position;
    if (make_uci_test_move("rook capture rights", &position, "g2a8",
                           &move, &undo)) {
        expect_u64("rook capture clears right", position.castling, 0);
        finish_move_test(&position, &initial, move, &undo);
    }
}

static void test_malformed_moves(void) {
    const char *start_fen =
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect_packed_move_rejected(
        "missing double pawn flag", start_fen,
        PACK_MOVE(12, 28, 0, 0));
    expect_packed_move_rejected(
        "double pawn knight", start_fen,
        PACK_MOVE(6, 21, 0, MOVE_DOUBLE_PAWN));
    expect_packed_move_rejected(
        "blocked double pawn",
        "4k3/8/8/8/8/4N3/4P3/4K3 w - - 0 1",
        PACK_MOVE(12, 28, 0, MOVE_DOUBLE_PAWN));
    expect_packed_move_rejected(
        "capture empty square", start_fen,
        PACK_MOVE(6, 21, 0, MOVE_CAPTURE));
    expect_packed_move_rejected(
        "missing capture flag",
        "r3k3/8/8/8/8/8/8/R3K3 w - - 0 1",
        PACK_MOVE(0, 56, 0, 0));
    expect_packed_move_rejected(
        "promotion before back rank", start_fen,
        PACK_MOVE(12, 20, 4, 0));
    expect_packed_move_rejected(
        "missing promotion",
        "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
        PACK_MOVE(48, 56, 0, 0));
    expect_packed_move_rejected(
        "wrong en passant target",
        "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1",
        PACK_MOVE(36, 45, 0, MOVE_CAPTURE | MOVE_EN_PASSANT));
    expect_packed_move_rejected(
        "unused packed bits", start_fen,
        PACK_MOVE(12, 20, 0, 0) | UINT32_C(0x80000));
}

static void test_make_undo_restoration(void) {
    static const char *move_text[] = {
        "e2e4", "a7a6", "e4e5", "d7d5", "e5d6", "c7d6",
        "g1f3", "g8f6", "f1e2", "e7e6", "e1g1"
    };
    enum { MOVE_COUNT = (int)(sizeof(move_text) / sizeof(move_text[0])) };
    position_t position;
    position_t initial;
    move_t moves[MOVE_COUNT];
    undo_t undo[MOVE_COUNT];

    set_start_position(&position);
    initial = position;
    for (int i = 0; i < MOVE_COUNT; ++i) {
        moves[i] = parse_uci_move(&position, move_text[i]);
        expect_true("sequence move parsed", moves[i] != 0);
        if (!moves[i]) return;
        expect_true("sequence move made", make_move(&position, moves[i], &undo[i]));
        expect_true("position after sequence move", position_is_valid(&position));
    }
    for (int i = MOVE_COUNT - 1; i >= 0; --i) {
        undo_move(&position, moves[i], &undo[i]);
        expect_true("position after sequence undo", position_is_valid(&position));
    }
    expect_position_state(&position, &initial);
}

static void run_perft_case(const char *name,
                           const char *fen,
                           const uint64_t *expected,
                           int max_depth) {
    position_t position;
    expect_true(name, set_position_fen(&position, fen));
    for (int depth = 1; depth <= max_depth; ++depth) {
        char label[64];
        snprintf(label, sizeof(label), "%s d%d", name, depth);
        expect_u64(label, perft(&position, depth), expected[depth - 1]);
        expect_true("position after perft", position_is_valid(&position));
    }
}

static void *create_mock_network(void) {
    uint8_t *memory = calloc(1, NNUE_FILE_SIZE);
    if (!memory) return NULL;
    nnue_header_t *header = (nnue_header_t *)memory;
    memcpy(header->magic, "P4NNUE1", 8);
    header->version = 1;
    header->bucket_count = NNUE_BUCKET_COUNT;
    header->features_per_bucket = NNUE_FEATURES_PER_BUCKET;
    header->hidden_size = NNUE_HIDDEN_SIZE;
    header->activation_clip = 127;
    header->feature_quantization = 64;
    header->output_quantization = 64;
    header->file_size = NNUE_FILE_SIZE;
    header->output_bias = 123;

    int16_t *feature_bias = (int16_t *)(memory + sizeof(*header));
    int16_t *output_weights = feature_bias + NNUE_HIDDEN_SIZE;
    int8_t *feature_weights =
        (int8_t *)(output_weights + 2 * NNUE_HIDDEN_SIZE);
    for (int i = 0; i < NNUE_HIDDEN_SIZE; ++i) {
        feature_bias[i] = (int16_t)(i - 31);
    }
    for (int i = 0; i < 2 * NNUE_HIDDEN_SIZE; ++i) {
        output_weights[i] = (int16_t)((i % 11) - 5);
    }
    for (int i = 0; i < NNUE_FEATURE_WEIGHT_COUNT; ++i) {
        feature_weights[i] = (int8_t)((i * 17 % 7) - 3);
    }
    return memory;
}

static void check_incremental_nnue(const char *name, const char *fen) {
    position_t position;
    expect_true(name, set_position_fen(&position, fen));
    move_list_t list;
    generate_moves(&position, &list, false);
    int legal_moves = 0;
    for (int i = 0; i < list.count; ++i) {
        undo_t undo;
        if (!make_move(&position, list.moves[i], &undo)) continue;
        ++legal_moves;
        int16_t accumulator[COLOR_COUNT][NNUE_HIDDEN_SIZE];
        uint8_t king_bucket[COLOR_COUNT] = {
            position.king_bucket[WHITE],
            position.king_bucket[BLACK]
        };
        memcpy(accumulator, position.accumulator, sizeof(accumulator));
        refresh_nnue(&position);
        if (memcmp(accumulator, position.accumulator, sizeof(accumulator)) ||
            king_bucket[WHITE] != position.king_bucket[WHITE] ||
            king_bucket[BLACK] != position.king_bucket[BLACK]) {
            fprintf(stderr, "%s nn mismatch\n", name);
            test_failed = 1;
        }
        undo_move(&position, list.moves[i], &undo);
        expect_true("position after undo", position_is_valid(&position));
    }
    expect_true("legal moves", legal_moves > 0);
}

static int count_legal_moves(position_t *position) {
    move_list_t list;
    generate_moves(position, &list, false);
    int legal_moves = 0;
    for (int i = 0; i < list.count; ++i) {
        undo_t undo;
        if (!make_move(position, list.moves[i], &undo)) continue;
        ++legal_moves;
        undo_move(position, list.moves[i], &undo);
    }
    return legal_moves;
}

static bool search_move_is_legal(position_t *position, move_t move) {
    if (!move) return false;
    move_list_t list;
    generate_moves(position, &list, false);
    for (int i = 0; i < list.count; ++i) {
        if (list.moves[i] != move) continue;
        undo_t undo;
        if (!make_move(position, move, &undo)) return false;
        undo_move(position, move, &undo);
        return true;
    }
    return false;
}

static int count_mating_moves(position_t *position, move_t *mating_move) {
    move_list_t list;
    generate_moves(position, &list, false);
    int mating_moves = 0;
    for (int i = 0; i < list.count; ++i) {
        undo_t undo;
        if (!make_move(position, list.moves[i], &undo)) continue;
        if (side_in_check(position, position->side_to_move) &&
            !count_legal_moves(position)) {
            ++mating_moves;
            *mating_move = list.moves[i];
        }
        undo_move(position, list.moves[i], &undo);
    }
    return mating_moves;
}

static void expect_valid_principal_variation(const char *name,
                                             const position_t *position,
                                             const search_result_t *result) {
    expect_true(name, result->pv_count >= 0 && result->pv_count <= MAX_PLY);
    if (!result->pv_count) {
        expect_true("empty variation has no best move", !result->best_move);
        return;
    }
    expect_u64("variation starts with best move", result->pv[0],
               result->best_move);
    position_t line = *position;
    for (int i = 0; i < result->pv_count; ++i) {
        move_list_t list;
        generate_moves(&line, &list, false);
        bool found = false;
        for (int j = 0; j < list.count; ++j) {
            if (list.moves[j] != result->pv[i]) continue;
            undo_t undo;
            if (!make_move(&line, result->pv[i], &undo)) continue;
            found = true;
            break;
        }
        expect_true("legal variation move", found);
        if (!found) break;
    }
}

static void test_terminal_search(void) {
    position_t position;
    expect_true("checkmate fen", set_position_fen(
        &position, "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1"));
    position_t initial = position;
    search_result_t result = search_position(
        &position, NULL, (search_limits_t){3, 0}, NULL, NULL);
    expect_true("checkmate score", result.score < -29000);
    expect_u64("checkmate best move", result.best_move, 0);
    expect_position_state(&position, &initial);

    expect_true("stalemate fen", set_position_fen(
        &position, "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"));
    initial = position;
    result = search_position(
        &position, NULL, (search_limits_t){3, 0}, NULL, NULL);
    expect_u64("stalemate score", result.score, 0);
    expect_u64("stalemate best move", result.best_move, 0);
    expect_position_state(&position, &initial);

    expect_true("mate in one fen", set_position_fen(
        &position, "7k/8/5KQ1/8/8/8/8/8 w - - 0 1"));
    initial = position;
    move_t mating_move = 0;
    expect_u64("unique mating move", count_mating_moves(&position, &mating_move),
               1);
    int mating_score = 0;
    for (int run = 0; run < 3; ++run) {
        result = search_position(
            &position, NULL, (search_limits_t){4, 0}, NULL, NULL);
        expect_true("mate in one score", result.score > 29000);
        if (!run) mating_score = result.score;
        expect_u64("stable mate score", result.score, mating_score);
        expect_u64("mate in one best move", result.best_move, mating_move);
        expect_u64("mate in one depth", result.depth, 1);
        expect_true("mate in one legal",
                    search_move_is_legal(&position, result.best_move));
        expect_position_state(&position, &initial);
    }

    expect_true("forced mate fen", set_position_fen(
        &position, "7k/8/5K2/4Q3/8/8/8/8 w - - 0 1"));
    initial = position;
    result = search_position(
        &position, NULL, (search_limits_t){5, 0}, NULL, NULL);
    expect_true("forced mate score", result.score > 29000);
    char move_text[6];
    move_to_uci(result.best_move, move_text);
    expect_text("forced mate move", move_text, "f6g6");
    expect_position_state(&position, &initial);
}

static void test_draw_search(void) {
    position_t position;
    expect_true("fifty move fen", set_position_fen(
        &position, "7k/8/8/8/8/8/6Q1/6K1 w - - 100 1"));
    position_t initial = position;
    search_result_t result = search_position(
        &position, NULL, (search_limits_t){3, 0}, NULL, NULL);
    expect_u64("fifty move score", result.score, 0);
    expect_true("fifty move fallback",
                search_move_is_legal(&position, result.best_move));
    expect_position_state(&position, &initial);

    set_start_position(&position);
    static const char *repetition_moves[] = {
        "g1f3", "g8f6", "f3g1", "f6g8"
    };
    for (size_t i = 0; i < sizeof(repetition_moves) /
                                  sizeof(repetition_moves[0]); ++i) {
        move_t move = parse_uci_move(&position, repetition_moves[i]);
        expect_true("repetition move parsed", move != 0);
        if (!move) return;
        undo_t undo;
        expect_true("repetition move made", make_move(&position, move, &undo));
    }
    initial = position;
    result = search_position(
        &position, NULL, (search_limits_t){3, 0}, NULL, NULL);
    expect_u64("repetition score", result.score, 0);
    expect_true("repetition fallback",
                search_move_is_legal(&position, result.best_move));
    expect_position_state(&position, &initial);
}

static void test_deterministic_search(void) {
    position_t position;
    expect_true("forced evasion fen", set_position_fen(
        &position, "7k/8/5K2/8/8/8/8/7R b - - 0 1"));
    position_t initial = position;
    expect_u64("one legal evasion", count_legal_moves(&position), 1);
    search_result_t first = search_position(
        &position, NULL, (search_limits_t){4, 0}, NULL, NULL);
    for (int run = 0; run < 3; ++run) {
        search_result_t result = search_position(
            &position, NULL, (search_limits_t){4, 0}, NULL, NULL);
        expect_u64("deterministic score", result.score, first.score);
        expect_u64("deterministic move", result.best_move, first.best_move);
        expect_true("deterministic legal move",
                    search_move_is_legal(&position, result.best_move));
        expect_position_state(&position, &initial);
    }
}

static bool table_is_clear(const transposition_table_t *table) {
    for (size_t i = 0; i < table->count; ++i) {
        const tt_entry_t *entry = &table->entries[i];
        if (entry->key || entry->move || entry->score ||
            entry->depth || entry->flag) return false;
    }
    return true;
}

static void test_transposition_table_search(void) {
    position_t position;
    expect_true("table search fen", set_position_fen(
        &position, "7k/8/5K2/4Q3/8/8/8/8 w - - 0 1"));
    position_t initial = position;
    search_limits_t limits = {5, 0};
    search_result_t no_table = search_position(
        &position, NULL, limits, NULL, NULL);

    transposition_table_t table = {0};
    expect_true("table allocation", resize_transposition_table(&table, 1));
    expect_true("table power of two",
                table.count && !(table.count & (table.count - 1)));
    expect_true("new table clear", table_is_clear(&table));
    search_result_t empty_table = search_position(
        &position, &table, limits, NULL, NULL);
    search_result_t reused_table = search_position(
        &position, &table, limits, NULL, NULL);
    expect_u64("empty table score", empty_table.score, no_table.score);
    expect_u64("reused table score", reused_table.score, no_table.score);
    expect_u64("empty table move", empty_table.best_move,
               no_table.best_move);
    expect_u64("reused table move", reused_table.best_move,
               no_table.best_move);
    expect_valid_principal_variation(
        "empty table variation", &position, &empty_table);
    expect_valid_principal_variation(
        "reused table variation", &position, &reused_table);
    expect_position_state(&position, &initial);

    move_t parent_move = reused_table.best_move;
    undo_t parent_undo;
    expect_true("mate parent move", make_move(
        &position, parent_move, &parent_undo));
    position_t child = position;
    search_result_t reused_child = search_position(
        &position, &table, (search_limits_t){3, 0}, NULL, NULL);
    clear_transposition_table(&table);
    expect_true("table clear", table_is_clear(&table));
    search_result_t clear_child = search_position(
        &position, &table, (search_limits_t){3, 0}, NULL, NULL);
    expect_u64("mate table score", reused_child.score, clear_child.score);
    expect_u64("mate table move", reused_child.best_move,
               clear_child.best_move);
    expect_true("child mate score", reused_child.score < -29000);
    expect_position_state(&position, &child);
    undo_move(&position, parent_move, &parent_undo);
    expect_position_state(&position, &initial);

    expect_true("table evasion fen", set_position_fen(
        &position, "7k/8/5K2/8/8/8/8/7R b - - 0 1"));
    initial = position;
    clear_transposition_table(&table);
    no_table = search_position(
        &position, NULL, (search_limits_t){4, 0}, NULL, NULL);
    empty_table = search_position(
        &position, &table, (search_limits_t){4, 0}, NULL, NULL);
    reused_table = search_position(
        &position, &table, (search_limits_t){4, 0}, NULL, NULL);
    expect_u64("evasion empty table score", empty_table.score,
               no_table.score);
    expect_u64("evasion reused table score", reused_table.score,
               no_table.score);
    expect_u64("evasion empty table move", empty_table.best_move,
               no_table.best_move);
    expect_u64("evasion reused table move", reused_table.best_move,
               no_table.best_move);
    expect_position_state(&position, &initial);

    expect_true("zero table resize", resize_transposition_table(&table, 0));
    expect_true("zero table state", !table.entries && !table.count);
}

typedef struct {
    search_result_t last;
    int calls;
} search_trace_t;

static void record_search_iteration(const search_result_t *result,
                                    void *argument) {
    search_trace_t *trace = argument;
    trace->last = *result;
    ++trace->calls;
}

static void test_search_timeout(void) {
    position_t position;
    expect_true("timeout fen", set_position_fen(
        &position,
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"));
    position_t initial = position;
    transposition_table_t table = {0};
    expect_true("timeout table", resize_transposition_table(&table, 1));
    search_trace_t trace = {0};
    search_result_t result = search_position(
        &position, &table, (search_limits_t){0, 10},
        record_search_iteration, &trace);
    expect_true("timeout legal move",
                search_move_is_legal(&position, result.best_move));
    if (trace.calls) {
        expect_u64("last completed depth", result.depth, trace.last.depth);
        expect_u64("last completed score", result.score, trace.last.score);
        expect_u64("last completed move", result.best_move,
                   trace.last.best_move);
    }
    expect_position_state(&position, &initial);
    free_transposition_table(&table);
}

static void test_search_structure_sizes(void) {
    expect_u64("position size", sizeof(position_t), 2512);
    expect_u64("undo size", sizeof(undo_t), 280);
    expect_u64("table entry size", sizeof(tt_entry_t), 16);
    expect_u64("search result size", sizeof(search_result_t), 544);
}

int main(void) {
    initialize_chess();
    expect_true("nn header", sizeof(nnue_header_t) == 32);
    test_search_structure_sizes();
    test_attacks();
    test_fen_loading();
    test_move_encoding();
    test_tactical_generation();
    test_castling();
    test_en_passant();
    test_promotions();
    test_legality_filter();
    test_castling_rights();
    test_malformed_moves();
    test_make_undo_restoration();

    static const uint64_t start_nodes[] = {20, 400, 8902, 197281, 4865609};
    static const uint64_t kiwi_nodes[] = {48, 2039, 97862, 4085603};
    static const uint64_t endgame_nodes[] = {14, 191, 2812, 43238, 674624};
    static const uint64_t position_four_nodes[] = {6, 264, 9467, 422333};
    static const uint64_t position_five_nodes[] = {44, 1486, 62379, 2103487};
    static const uint64_t position_six_nodes[] = {46, 2079, 89890, 3894594};
    run_perft_case("start",
                   "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                   start_nodes, 5);
    run_perft_case("kiwi",
                   "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
                   kiwi_nodes, 4);
    run_perft_case("end",
                   "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
                   endgame_nodes, 5);
    run_perft_case("p4",
                   "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
                   position_four_nodes, 4);
    run_perft_case("p5",
                   "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
                   position_five_nodes, 4);
    run_perft_case("p6",
                   "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
                   position_six_nodes, 4);

    void *network = create_mock_network();
    expect_true("net alloc", network != NULL);
    expect_true("net bind", network && bind_nnue(network, NNUE_FILE_SIZE));
    check_incremental_nnue(
        "inc start",
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    check_incremental_nnue(
        "inc kiwi",
        "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
    check_incremental_nnue(
        "inc ep",
        "8/8/8/3pP3/8/8/4K3/7k w - d6 0 1");
    check_incremental_nnue(
        "inc promo",
        "4k3/P7/8/8/8/8/7p/4K3 w - - 0 1");

    test_terminal_search();
    test_draw_search();
    test_deterministic_search();
    test_transposition_table_search();
    test_search_timeout();

    unload_nnue();
    free(network);
    if (test_failed) return 1;
    puts("ok");
    return 0;
}
