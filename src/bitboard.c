#include "ch.h"

bitboard_t knight_attacks[64];
bitboard_t king_attacks[64];
bitboard_t pawn_attacks[COLOR_COUNT][64];
bitboard_t attack_rays[8][64];
uint64_t zobrist_piece[PIECE_COUNT][64];
uint64_t zobrist_castling[16];
uint64_t zobrist_en_passant[8];
uint64_t zobrist_side;

static uint64_t splitmix64(uint64_t *state) {
    uint64_t value = (*state += UINT64_C(0x9e3779b97f4a7c15));
    value = (value ^ (value >> 30)) * UINT64_C(0xbf58476d1ce4e5b9);
    value = (value ^ (value >> 27)) * UINT64_C(0x94d049bb133111eb);
    return value ^ (value >> 31);
}

static bitboard_t build_ray(int square, int file_step, int rank_step) {
    bitboard_t ray = 0;
    int file = square & 7;
    int rank = square >> 3;
    for (;;) {
        file += file_step;
        rank += rank_step;
        if ((unsigned)file > 7u || (unsigned)rank > 7u) break;
        ray |= SQUARE_BIT(MAKE_SQUARE(file, rank));
    }
    return ray;
}

void initialize_chess(void) {
    static bool initialized;
    if (initialized) return;
    initialized = true;

    static const int knight_file_step[8] = {1, 2, 2, 1, -1, -2, -2, -1};
    static const int knight_rank_step[8] = {2, 1, -1, -2, -2, -1, 1, 2};
    static const int ray_file_step[8] = {0, 0, 1, -1, 1, -1, 1, -1};
    static const int ray_rank_step[8] = {1, -1, 0, 0, 1, 1, -1, -1};

    for (int square = 0; square < 64; ++square) {
        int file = square & 7;
        int rank = square >> 3;
        for (int i = 0; i < 8; ++i) {
            int to_file = file + knight_file_step[i];
            int to_rank = rank + knight_rank_step[i];
            if ((unsigned)to_file < 8u && (unsigned)to_rank < 8u) {
                knight_attacks[square] |= SQUARE_BIT(MAKE_SQUARE(to_file, to_rank));
            }
        }
        for (int file_step = -1; file_step <= 1; ++file_step) {
            for (int rank_step = -1; rank_step <= 1; ++rank_step) {
                if (!file_step && !rank_step) continue;
                int to_file = file + file_step;
                int to_rank = rank + rank_step;
                if ((unsigned)to_file < 8u && (unsigned)to_rank < 8u) {
                    king_attacks[square] |= SQUARE_BIT(MAKE_SQUARE(to_file, to_rank));
                }
            }
        }
        if (rank < 7) {
            if (file) pawn_attacks[WHITE][square] |= SQUARE_BIT(square + 7);
            if (file < 7) pawn_attacks[WHITE][square] |= SQUARE_BIT(square + 9);
        }
        if (rank) {
            if (file) pawn_attacks[BLACK][square] |= SQUARE_BIT(square - 9);
            if (file < 7) pawn_attacks[BLACK][square] |= SQUARE_BIT(square - 7);
        }
        for (int direction = 0; direction < 8; ++direction) {
            attack_rays[direction][square] =
                build_ray(square, ray_file_step[direction], ray_rank_step[direction]);
        }
    }

    uint64_t random_state = UINT64_C(0x7069346e6e756531);
    for (int piece = 0; piece < PIECE_COUNT; ++piece) {
        for (int square = 0; square < 64; ++square) {
            zobrist_piece[piece][square] = splitmix64(&random_state);
        }
    }
    for (int i = 0; i < 16; ++i) zobrist_castling[i] = splitmix64(&random_state);
    for (int i = 0; i < 8; ++i) zobrist_en_passant[i] = splitmix64(&random_state);
    zobrist_side = splitmix64(&random_state);
}

static bitboard_t sliding_line_attacks(int square,
                                       bitboard_t occupancy,
                                       int direction,
                                       bool scan_high) {
    // trim squares beyond nearest blocker
    bitboard_t attacks = attack_rays[direction][square];
    bitboard_t blockers = attacks & occupancy;
    if (!blockers) return attacks;
    int blocker_square = scan_high ? 63 - __builtin_clzll(blockers)
                                   : __builtin_ctzll(blockers);
    return attacks ^ attack_rays[direction][blocker_square];
}

bitboard_t generate_bishop_attacks(int square, bitboard_t occupancy) {
    return sliding_line_attacks(square, occupancy, 4, false) |
           sliding_line_attacks(square, occupancy, 5, false) |
           sliding_line_attacks(square, occupancy, 6, true) |
           sliding_line_attacks(square, occupancy, 7, true);
}

bitboard_t generate_rook_attacks(int square, bitboard_t occupancy) {
    return sliding_line_attacks(square, occupancy, 0, false) |
           sliding_line_attacks(square, occupancy, 1, true) |
           sliding_line_attacks(square, occupancy, 2, false) |
           sliding_line_attacks(square, occupancy, 3, true);
}
