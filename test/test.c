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

static void write_u16_le(uint8_t *bytes, int offset, uint16_t value) {
    bytes[offset] = (uint8_t)value;
    bytes[offset + 1] = (uint8_t)(value >> 8);
}

static void write_u32_le(uint8_t *bytes, int offset, uint32_t value) {
    bytes[offset] = (uint8_t)value;
    bytes[offset + 1] = (uint8_t)(value >> 8);
    bytes[offset + 2] = (uint8_t)(value >> 16);
    bytes[offset + 3] = (uint8_t)(value >> 24);
}

static void write_i32_le(uint8_t *bytes, int offset, int32_t value) {
    write_u32_le(bytes, offset, (uint32_t)value);
}

static void expect_u16_le(const char *name,
                          const uint8_t *bytes,
                          int offset,
                          uint16_t expected) {
    expect_u64(name, bytes[offset], expected & 0xffu);
    expect_u64(name, bytes[offset + 1], expected >> 8);
}

static void expect_u32_le(const char *name,
                          const uint8_t *bytes,
                          int offset,
                          uint32_t expected) {
    for (int i = 0; i < 4; ++i) {
        expect_u64(name, bytes[offset + i], (expected >> (8 * i)) & 0xffu);
    }
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
    expect_memory("accumulator", position->accumulator,
                  expected->accumulator, sizeof(position->accumulator));
    expect_memory("king bucket", position->king_bucket,
                  expected->king_bucket, sizeof(position->king_bucket));
    expect_memory("king mirror", position->king_mirror,
                  expected->king_mirror, sizeof(position->king_mirror));
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

static int compare_ints(const void *left, const void *right) {
    int a = *(const int *)left;
    int b = *(const int *)right;
    return (a > b) - (a < b);
}

static void test_nnue_feature_mapping(void) {
    if (NNUE_BUCKET_COUNT == 8) {
        FILE *fixtures = fopen(P4_NNUE_FIXTURE_PATH, "r");
        expect_true("feature fixtures open", fixtures != NULL);
        if (!fixtures) return;
        char line[2048];
        int fixture_count = 0;
        while (fgets(line, sizeof(line), fixtures)) {
            if (line[0] == '#' || line[0] == '\n') continue;
            char *name = strtok(line, "|");
            char *fen = strtok(NULL, "|");
            char *perspective_text = strtok(NULL, "|");
            char *bucket_text = strtok(NULL, "|");
            char *features_text = strtok(NULL, "\r\n");
            expect_true("feature fixture fields",
                        name && fen && perspective_text && bucket_text &&
                        features_text);
            if (!name || !fen || !perspective_text || !bucket_text ||
                !features_text) continue;

            int perspective = atoi(perspective_text);
            int expected_bucket = atoi(bucket_text);
            int expected[NNUE_MAX_ACTIVE_FEATURES];
            int expected_count = 0;
            for (char *value = strtok(features_text, ",");
                 value && expected_count < NNUE_MAX_ACTIVE_FEATURES;
                 value = strtok(NULL, ",")) {
                expected[expected_count++] = atoi(value);
            }

            position_t position;
            expect_true(name, set_position_fen(&position, fen));
            int king_square = find_king_square(&position, perspective);
            expect_u64("fixture king bucket",
                       (uint64_t)nnue_king_bucket(king_square, perspective),
                       (uint64_t)expected_bucket);
            int actual[NNUE_MAX_ACTIVE_FEATURES];
            int actual_count = 0;
            for (int piece = 0; piece < PIECE_COUNT; ++piece) {
                bitboard_t pieces = position.pieces[piece];
                while (pieces) {
                    int square = pop_first_square(&pieces);
                    int feature = nnue_feature_index(
                        king_square, piece, square, perspective);
                    if (feature >= 0) actual[actual_count++] = feature;
                }
            }
            qsort(actual, (size_t)actual_count, sizeof(actual[0]), compare_ints);
            expect_u64("fixture feature count", (uint64_t)actual_count,
                       (uint64_t)expected_count);
            if (actual_count == expected_count) {
                expect_memory(name, actual, expected,
                              (size_t)actual_count * sizeof(actual[0]));
            }
            ++fixture_count;
        }
        fclose(fixtures);
        expect_u64("feature fixture count", (uint64_t)fixture_count, 10);
    }
    int rank_bands = NNUE_BUCKET_COUNT / 4;
    for (int square = 0; square < 64; ++square) {
        int file = square & 7;
        int rank = square >> 3;
        int normalized_file = file < 4 ? file : 7 - file;
        int expected = normalized_file + 4 * (rank * rank_bands / 8);
        expect_u64("profile king bucket",
                   (uint64_t)nnue_king_bucket(square, WHITE),
                   (uint64_t)expected);
        expect_u64("profile vertical bucket",
                   (uint64_t)nnue_king_bucket(square ^ 56, BLACK),
                   (uint64_t)expected);
    }
    expect_u64("left king bucket", (uint64_t)nnue_king_bucket(3, WHITE), 3);
    expect_u64("right king bucket", (uint64_t)nnue_king_bucket(4, WHITE), 3);
    expect_true("left king not mirrored", !nnue_king_mirror(3, WHITE));
    expect_true("right king mirrored", nnue_king_mirror(4, WHITE));
    expect_u64("mirrored feature pair",
               (uint64_t)nnue_feature_index(3, WHITE_PAWN, 8, WHITE),
               (uint64_t)nnue_feature_index(4, WHITE_PAWN, 15, WHITE));
}

static void *create_mock_network(void) {
    uint8_t *memory = calloc(1, NNUE_FILE_SIZE);
    if (!memory) return NULL;
    memcpy(memory + NNUE_MAGIC_OFFSET, NNUE_MAGIC, NNUE_MAGIC_SIZE);
    write_u16_le(memory, NNUE_VERSION_OFFSET, NNUE_FORMAT_VERSION);
    write_u16_le(memory, NNUE_BUCKET_COUNT_OFFSET, NNUE_BUCKET_COUNT);
    write_u16_le(memory, NNUE_FEATURES_PER_BUCKET_OFFSET,
                 NNUE_FEATURES_PER_BUCKET);
    write_u16_le(memory, NNUE_HIDDEN_SIZE_OFFSET, NNUE_HIDDEN_SIZE);
    write_u16_le(memory, NNUE_ACTIVATION_CLIP_OFFSET, NNUE_ACTIVATION_CLIP);
    write_u16_le(memory, NNUE_FEATURE_QUANTIZATION_OFFSET,
                 NNUE_FEATURE_QUANTIZATION);
    write_u16_le(memory, NNUE_OUTPUT_QUANTIZATION_OFFSET,
                 NNUE_OUTPUT_QUANTIZATION);
    write_u16_le(memory, NNUE_PERSPECTIVE_COUNT_OFFSET,
                 NNUE_PERSPECTIVE_COUNT);
    write_u32_le(memory, NNUE_FILE_SIZE_OFFSET, NNUE_FILE_SIZE);
    write_i32_le(memory, NNUE_OUTPUT_BIAS_OFFSET, 123);

    int16_t *feature_bias =
        (int16_t *)(memory + NNUE_FEATURE_BIAS_OFFSET);
    int16_t *output_weights =
        (int16_t *)(memory + NNUE_OUTPUT_WEIGHTS_OFFSET);
    int8_t *feature_weights =
        (int8_t *)(memory + NNUE_FEATURE_WEIGHTS_OFFSET);
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

static void test_nnue_format_layout(const uint8_t *memory) {
    expect_u64("nn magic offset", NNUE_MAGIC_OFFSET, 0);
    expect_u64("nn version offset", NNUE_VERSION_OFFSET, 8);
    expect_u64("nn bucket offset", NNUE_BUCKET_COUNT_OFFSET, 10);
    expect_u64("nn features offset", NNUE_FEATURES_PER_BUCKET_OFFSET, 12);
    expect_u64("nn width offset", NNUE_HIDDEN_SIZE_OFFSET, 14);
    expect_u64("nn clip offset", NNUE_ACTIVATION_CLIP_OFFSET, 16);
    expect_u64("nn feature quantization offset",
               NNUE_FEATURE_QUANTIZATION_OFFSET, 18);
    expect_u64("nn output quantization offset",
               NNUE_OUTPUT_QUANTIZATION_OFFSET, 20);
    expect_u64("nn perspective offset", NNUE_PERSPECTIVE_COUNT_OFFSET, 22);
    expect_u64("nn file size offset", NNUE_FILE_SIZE_OFFSET, 24);
    expect_u64("nn header size", NNUE_HEADER_SIZE, 28);
    expect_u64("nn output bias offset", NNUE_OUTPUT_BIAS_OFFSET, 28);
    expect_u64("nn feature bias offset", NNUE_FEATURE_BIAS_OFFSET, 32);
    expect_memory("nn magic bytes", memory, NNUE_MAGIC, NNUE_MAGIC_SIZE);
    expect_u16_le("nn version bytes", memory, NNUE_VERSION_OFFSET,
                  NNUE_FORMAT_VERSION);
    expect_u16_le("nn bucket bytes", memory, NNUE_BUCKET_COUNT_OFFSET,
                  NNUE_BUCKET_COUNT);
    expect_u16_le("nn features bytes", memory,
                  NNUE_FEATURES_PER_BUCKET_OFFSET,
                  NNUE_FEATURES_PER_BUCKET);
    expect_u16_le("nn width bytes", memory, NNUE_HIDDEN_SIZE_OFFSET,
                  NNUE_HIDDEN_SIZE);
    expect_u16_le("nn clip bytes", memory, NNUE_ACTIVATION_CLIP_OFFSET,
                  NNUE_ACTIVATION_CLIP);
    expect_u16_le("nn feature quantization bytes", memory,
                  NNUE_FEATURE_QUANTIZATION_OFFSET,
                  NNUE_FEATURE_QUANTIZATION);
    expect_u16_le("nn output quantization bytes", memory,
                  NNUE_OUTPUT_QUANTIZATION_OFFSET,
                  NNUE_OUTPUT_QUANTIZATION);
    expect_u16_le("nn perspective bytes", memory,
                  NNUE_PERSPECTIVE_COUNT_OFFSET,
                  NNUE_PERSPECTIVE_COUNT);
    expect_u32_le("nn file size bytes", memory, NNUE_FILE_SIZE_OFFSET,
                  NNUE_FILE_SIZE);
    expect_u32_le("nn output bias bytes", memory, NNUE_OUTPUT_BIAS_OFFSET,
                  123);
}

static void expect_network_rejected(const char *name,
                                    const void *memory,
                                    size_t size) {
    unload_nnue();
    expect_true(name, !bind_nnue(memory, size));
    expect_true("invalid network unloaded", !nnue_is_loaded());
}

static void test_nnue_loader(void *memory) {
    uint8_t *bytes = memory;
    uint8_t valid_header[NNUE_HEADER_SIZE];
    memcpy(valid_header, memory, sizeof(valid_header));
    int16_t *feature_bias =
        (int16_t *)(bytes + NNUE_FEATURE_BIAS_OFFSET);

    expect_true("valid network bind", bind_nnue(memory, NNUE_FILE_SIZE));
    expect_true("valid network loaded", nnue_is_loaded());
    unload_nnue();

    bytes[NNUE_MAGIC_OFFSET + NNUE_MAGIC_SIZE - 1] = 'x';
    expect_network_rejected("network magic", memory, NNUE_FILE_SIZE);
    memcpy(memory, valid_header, sizeof(valid_header));
    bytes[NNUE_VERSION_OFFSET] ^= 1u;
    expect_network_rejected("network version", memory, NNUE_FILE_SIZE);
    memcpy(memory, valid_header, sizeof(valid_header));
    bytes[NNUE_BUCKET_COUNT_OFFSET] ^= 1u;
    expect_network_rejected("network buckets", memory, NNUE_FILE_SIZE);
    memcpy(memory, valid_header, sizeof(valid_header));
    bytes[NNUE_FEATURES_PER_BUCKET_OFFSET] ^= 1u;
    expect_network_rejected("network features", memory, NNUE_FILE_SIZE);
    memcpy(memory, valid_header, sizeof(valid_header));
    bytes[NNUE_HIDDEN_SIZE_OFFSET] ^= 1u;
    expect_network_rejected("network width", memory, NNUE_FILE_SIZE);
    memcpy(memory, valid_header, sizeof(valid_header));
    bytes[NNUE_ACTIVATION_CLIP_OFFSET] ^= 1u;
    expect_network_rejected("network clip", memory, NNUE_FILE_SIZE);
    memcpy(memory, valid_header, sizeof(valid_header));
    bytes[NNUE_FEATURE_QUANTIZATION_OFFSET] ^= 1u;
    expect_network_rejected("network feature quantization",
                            memory, NNUE_FILE_SIZE);
    memcpy(memory, valid_header, sizeof(valid_header));
    bytes[NNUE_OUTPUT_QUANTIZATION_OFFSET] ^= 1u;
    expect_network_rejected("network output quantization",
                            memory, NNUE_FILE_SIZE);
    memcpy(memory, valid_header, sizeof(valid_header));
    bytes[NNUE_PERSPECTIVE_COUNT_OFFSET] ^= 1u;
    expect_network_rejected("network perspectives", memory, NNUE_FILE_SIZE);
    memcpy(memory, valid_header, sizeof(valid_header));
    bytes[NNUE_FILE_SIZE_OFFSET] ^= 1u;
    expect_network_rejected("network header size", memory, NNUE_FILE_SIZE);
    memcpy(memory, valid_header, sizeof(valid_header));
    expect_network_rejected("network data size", memory, NNUE_FILE_SIZE - 1);

    int16_t saved_bias = feature_bias[0];
    int16_t saved_bias_1 = feature_bias[1];
    feature_bias[0] = NNUE_ACCUMULATOR_BIAS_MIN - 1;
    expect_network_rejected("network low bias", memory, NNUE_FILE_SIZE);
    feature_bias[0] = NNUE_ACCUMULATOR_BIAS_MAX + 1;
    expect_network_rejected("network high bias", memory, NNUE_FILE_SIZE);
    feature_bias[0] = saved_bias;

    feature_bias[0] = NNUE_ACCUMULATOR_BIAS_MIN;
    feature_bias[1] = NNUE_ACCUMULATOR_BIAS_MAX;
    expect_true("network bias boundaries", bind_nnue(memory, NNUE_FILE_SIZE));
    unload_nnue();
    feature_bias[0] = saved_bias;
    feature_bias[1] = saved_bias_1;

    uint8_t *unaligned = malloc(NNUE_FILE_SIZE + 1u);
    expect_true("unaligned network allocation", unaligned != NULL);
    if (unaligned) {
        memcpy(unaligned + 1, memory, NNUE_FILE_SIZE);
        expect_network_rejected(
            "network alignment", unaligned + 1, NNUE_FILE_SIZE);
        free(unaligned);
    }

    const char *model_path = "p4nnue-runtime-test.bin";
    FILE *model_file = fopen(model_path, "wb");
    expect_true("network file create", model_file != NULL);
    if (model_file) {
        expect_u64("network file write",
                   fwrite(memory, 1, NNUE_FILE_SIZE, model_file),
                   NNUE_FILE_SIZE);
        expect_true("network file close", !fclose(model_file));
        expect_true("network file load", load_nnue(model_path));
        expect_true("owned network loaded", nnue_is_loaded());
        unload_nnue();
        expect_true("network file remove", !remove(model_path));
    }
    expect_true("final network bind", bind_nnue(memory, NNUE_FILE_SIZE));
}

static void check_incremental_nnue(const char *name, const char *fen) {
    position_t position;
    expect_true(name, set_position_fen(&position, fen));
    move_list_t list;
    generate_moves(&position, &list, false);
    int legal_moves = 0;
    for (int i = 0; i < list.count; ++i) {
        position_t initial = position;
        undo_t undo;
        if (!make_move(&position, list.moves[i], &undo)) {
            expect_position_state(&position, &initial);
            continue;
        }
        ++legal_moves;
        position_t incremental = position;
        int incremental_score = evaluate_nnue(&position);
        refresh_nnue(&position);
        if (memcmp(incremental.accumulator, position.accumulator,
                   sizeof(position.accumulator)) ||
            memcmp(incremental.king_bucket, position.king_bucket,
                   sizeof(position.king_bucket)) ||
            memcmp(incremental.king_mirror, position.king_mirror,
                   sizeof(position.king_mirror)) ||
            incremental_score != evaluate_nnue(&position)) {
            fprintf(stderr, "%s nn mismatch\n", name);
            test_failed = 1;
        }
        undo_move(&position, list.moves[i], &undo);
        expect_true("position after undo", position_is_valid(&position));
        expect_position_state(&position, &initial);
    }
    expect_true("legal moves", legal_moves > 0);
}

enum { KING_VIEW_UNCHECKED, KING_VIEW_SAME, KING_VIEW_CHANGED };

static void test_incremental_move(const char *name,
                                  const char *fen,
                                  const char *move_text,
                                  int expected_king_view) {
    position_t position;
    expect_true(name, set_position_fen(&position, fen));
    position_t initial = position;
    move_t move = find_generated_move(&position, move_text, false);
    expect_true("incremental move generated", move != 0);
    if (!move) return;
    int side = position.side_to_move;
    undo_t undo;
    expect_true("incremental move legal", make_move(&position, move, &undo));
    bool king_view_changed =
        position.king_bucket[side] != initial.king_bucket[side] ||
        position.king_mirror[side] != initial.king_mirror[side];
    if (expected_king_view == KING_VIEW_SAME) {
        expect_true("same king view", !king_view_changed);
        expect_memory("same view accumulator", position.accumulator[side],
                      initial.accumulator[side],
                      sizeof(position.accumulator[side]));
    } else if (expected_king_view == KING_VIEW_CHANGED) {
        expect_true("changed king view", king_view_changed);
    }

    position_t incremental = position;
    int incremental_score = evaluate_nnue(&position);
    refresh_nnue(&position);
    expect_memory("focused incremental accumulator", position.accumulator,
                  incremental.accumulator, sizeof(position.accumulator));
    expect_memory("focused incremental bucket", position.king_bucket,
                  incremental.king_bucket, sizeof(position.king_bucket));
    expect_memory("focused incremental mirror", position.king_mirror,
                  incremental.king_mirror, sizeof(position.king_mirror));
    expect_u64("focused incremental evaluation",
               (uint64_t)evaluate_nnue(&position),
               (uint64_t)incremental_score);
    undo_move(&position, move, &undo);
    expect_position_state(&position, &initial);
}

static void test_focused_incremental_nnue(void) {
    const char *start =
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    test_incremental_move("quiet pawn", start, "e2e3", KING_VIEW_UNCHECKED);
    test_incremental_move("double pawn", start, "e2e4", KING_VIEW_UNCHECKED);
    test_incremental_move("knight", start, "g1f3", KING_VIEW_UNCHECKED);
    test_incremental_move(
        "bishop", "7k/8/8/8/8/8/2B5/K7 w - - 0 1", "c2d3",
        KING_VIEW_UNCHECKED);
    test_incremental_move(
        "rook", "7k/8/8/8/8/8/R7/K7 w - - 0 1", "a2a3",
        KING_VIEW_UNCHECKED);
    test_incremental_move(
        "queen", "7k/8/8/8/8/8/Q7/K7 w - - 0 1", "a2b3",
        KING_VIEW_UNCHECKED);
    test_incremental_move(
        "same bucket king", "7k/8/8/8/8/8/8/K7 w - - 0 1", "a1a2",
        KING_VIEW_SAME);
    test_incremental_move(
        "black nonfeature king", "7k/8/8/8/8/8/8/K7 b - - 0 1", "h8h7",
        KING_VIEW_SAME);
    test_incremental_move(
        "bucket crossing king", "7k/8/8/8/K7/8/8/8 w - - 0 1", "a4a5",
        NNUE_BUCKET_COUNT == 4 ? KING_VIEW_SAME : KING_VIEW_CHANGED);
    test_incremental_move(
        "mirror crossing king", "7k/8/8/8/8/8/8/3K4 w - - 0 1", "d1e1",
        KING_VIEW_CHANGED);
    test_incremental_move(
        "capture", "7k/8/8/8/3p4/2B5/8/K7 w - - 0 1", "c3d4",
        KING_VIEW_UNCHECKED);
    test_incremental_move(
        "en passant", "7k/8/8/3pP3/8/8/8/K7 w - d6 0 1", "e5d6",
        KING_VIEW_UNCHECKED);
    const char *promotion = "7k/P7/8/8/8/8/8/K7 w - - 0 1";
    test_incremental_move(
        "queen promotion", promotion, "a7a8q", KING_VIEW_UNCHECKED);
    test_incremental_move(
        "rook promotion", promotion, "a7a8r", KING_VIEW_UNCHECKED);
    test_incremental_move(
        "bishop promotion", promotion, "a7a8b", KING_VIEW_UNCHECKED);
    test_incremental_move(
        "knight promotion", promotion, "a7a8n", KING_VIEW_UNCHECKED);
    test_incremental_move(
        "capture promotion", "1r5k/P7/8/8/8/8/8/K7 w - - 0 1",
        "a7b8q", KING_VIEW_UNCHECKED);
    test_incremental_move(
        "white king castle", "4k3/8/8/8/8/8/8/4K2R w K - 0 1",
        "e1g1", KING_VIEW_CHANGED);
    test_incremental_move(
        "white queen castle", "4k3/8/8/8/8/8/8/R3K3 w Q - 0 1",
        "e1c1", KING_VIEW_CHANGED);
    test_incremental_move(
        "black king castle", "4k2r/8/8/8/8/8/8/4K3 b k - 0 1",
        "e8g8", KING_VIEW_CHANGED);
    test_incremental_move(
        "black queen castle", "r3k3/8/8/8/8/8/8/4K3 b q - 0 1",
        "e8c8", KING_VIEW_CHANGED);
}

static void test_incremental_nnue_sequence(void) {
    enum { SEQUENCE_LIMIT = 48 };
    position_t position;
    set_start_position(&position);
    position_t initial = position;
    move_t moves[SEQUENCE_LIMIT];
    undo_t undo[SEQUENCE_LIMIT];
    uint64_t random_state = UINT64_C(0x6e6e7565736571);
    int move_count = 0;

    while (move_count < SEQUENCE_LIMIT) {
        move_list_t list;
        generate_moves(&position, &list, false);
        if (!list.count) break;
        int start = (int)(next_test_bits(&random_state) %
                          (uint64_t)list.count);
        bool made = false;
        for (int offset = 0; offset < list.count; ++offset) {
            int index = (start + offset) % list.count;
            position_t before = position;
            if (!make_move(&position, list.moves[index], &undo[move_count])) {
                expect_position_state(&position, &before);
                continue;
            }
            moves[move_count] = list.moves[index];
            position_t incremental = position;
            int incremental_score = evaluate_nnue(&position);
            refresh_nnue(&position);
            expect_memory("sequence incremental accumulator",
                          position.accumulator, incremental.accumulator,
                          sizeof(position.accumulator));
            expect_memory("sequence incremental bucket", position.king_bucket,
                          incremental.king_bucket,
                          sizeof(position.king_bucket));
            expect_memory("sequence incremental mirror", position.king_mirror,
                          incremental.king_mirror,
                          sizeof(position.king_mirror));
            expect_u64("sequence incremental evaluation",
                       (uint64_t)evaluate_nnue(&position),
                       (uint64_t)incremental_score);
            ++move_count;
            made = true;
            break;
        }
        if (!made) break;
    }
    expect_true("sequence length", move_count >= 24);
    while (move_count) {
        --move_count;
        undo_move(&position, moves[move_count], &undo[move_count]);
        position_t incremental = position;
        refresh_nnue(&position);
        expect_memory("sequence undo accumulator", position.accumulator,
                      incremental.accumulator, sizeof(position.accumulator));
        expect_memory("sequence undo bucket", position.king_bucket,
                      incremental.king_bucket, sizeof(position.king_bucket));
        expect_memory("sequence undo mirror", position.king_mirror,
                      incremental.king_mirror, sizeof(position.king_mirror));
    }
    expect_position_state(&position, &initial);
}

static void clear_network_parameters(void *memory) {
    uint8_t *bytes = memory;
    write_i32_le(bytes, NNUE_OUTPUT_BIAS_OFFSET, 0);
    memset(bytes + NNUE_FEATURE_BIAS_OFFSET, 0,
           NNUE_FILE_SIZE - NNUE_FEATURE_BIAS_OFFSET);
}

static void test_nnue_evaluation(void *memory) {
    uint8_t *bytes = memory;
    int16_t *feature_bias =
        (int16_t *)(bytes + NNUE_FEATURE_BIAS_OFFSET);
    int16_t *output_weights =
        (int16_t *)(bytes + NNUE_OUTPUT_WEIGHTS_OFFSET);
    int8_t *feature_weights =
        (int8_t *)(bytes + NNUE_FEATURE_WEIGHTS_OFFSET);
    position_t position;

    unload_nnue();
    clear_network_parameters(memory);
    write_i32_le(bytes, NNUE_OUTPUT_BIAS_OFFSET,
                 -NNUE_FEATURE_QUANTIZATION * NNUE_OUTPUT_QUANTIZATION);
    expect_true("negative bias network", bind_nnue(memory, NNUE_FILE_SIZE));
    expect_true("negative bias fen", set_position_fen(
        &position, "7k/8/8/8/8/8/8/K7 w - - 0 1"));
    expect_true("negative bias output", evaluate_nnue(&position) == -1);

    unload_nnue();
    clear_network_parameters(memory);
    feature_bias[0] = -20;
    feature_bias[1] = 200;
    output_weights[0] = INT16_MAX;
    output_weights[1] = NNUE_OUTPUT_QUANTIZATION;
    expect_true("activation network", bind_nnue(memory, NNUE_FILE_SIZE));
    expect_true("activation fen", set_position_fen(
        &position, "7k/8/8/8/8/8/8/K7 w - - 0 1"));
    expect_u64("zero and upper clipping", (uint64_t)evaluate_nnue(&position), 1);
    unload_nnue();
    output_weights[1] = -NNUE_OUTPUT_QUANTIZATION;
    expect_true("negative network", bind_nnue(memory, NNUE_FILE_SIZE));
    expect_true("negative fen", set_position_fen(
        &position, "7k/8/8/8/8/8/8/K7 w - - 0 1"));
    expect_true("negative output", evaluate_nnue(&position) == -1);

    unload_nnue();
    clear_network_parameters(memory);
    feature_weights[8 * NNUE_HIDDEN_SIZE] = 100;
    feature_weights[375 * NNUE_HIDDEN_SIZE] = 20;
    output_weights[0] = NNUE_OUTPUT_QUANTIZATION;
    output_weights[NNUE_HIDDEN_SIZE] = -NNUE_OUTPUT_QUANTIZATION;
    expect_true("perspective network", bind_nnue(memory, NNUE_FILE_SIZE));
    expect_true("white perspective fen", set_position_fen(
        &position, "7k/8/8/8/8/8/P7/K7 w - - 0 1"));
    expect_true("white perspective score", evaluate_nnue(&position) == 1);
    expect_true("black perspective fen", set_position_fen(
        &position, "7k/8/8/8/8/8/P7/K7 b - - 0 1"));
    expect_true("black perspective score", evaluate_nnue(&position) == -1);
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
    expect_true("byte table allocation",
                resize_transposition_table_bytes(&table, 256u * 1024u));
    expect_u64("byte table count", table.count, 16384);
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
    expect_u64("position size", sizeof(position_t),
               2256 + 4 * NNUE_HIDDEN_SIZE);
    expect_u64("undo size", sizeof(undo_t), 24);
    expect_u64("table entry size", sizeof(tt_entry_t), 16);
    expect_u64("search result size", sizeof(search_result_t), 544);
}

int main(void) {
    initialize_chess();
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
    test_nnue_feature_mapping();

    void *network = create_mock_network();
    expect_true("net alloc", network != NULL);
    if (!network) return 1;
    test_nnue_format_layout(network);
    test_nnue_loader(network);
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
    test_focused_incremental_nnue();
    test_incremental_nnue_sequence();
    test_nnue_evaluation(network);

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
