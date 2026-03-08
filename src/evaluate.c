#include "ch.h"

static const int piece_value[PIECE_TYPE_COUNT] = {100, 320, 330, 500, 900, 0};

static int piece_square_value(int type, int square, int color) {
    if (color == BLACK) square ^= 56;
    int file = square & 7;
    int rank = square >> 3;
    int file_distance = file < 4 ? 3 - file : file - 4;
    int rank_distance = rank < 4 ? 3 - rank : rank - 4;
    int center = 6 - file_distance - rank_distance;
    if (type == PAWN) return rank * 6 + center;
    if (type == KNIGHT) return center * 8;
    if (type == BISHOP) return center * 5;
    if (type == ROOK) return rank * 2;
    if (type == QUEEN) return center * 2;
    return rank < 2 ? 12 - center * 2 : -center * 2;
}

int evaluate(const position_t *position) {
    if (nnue_is_loaded()) return evaluate_nnue(position);
    int score = 0;
    for (int piece = 0; piece < PIECE_COUNT; ++piece) {
        int color = piece_color(piece);
        int type = piece_type(piece);
        bitboard_t pieces = position->pieces[piece];
        while (pieces) {
            int square = pop_first_square(&pieces);
            int value = piece_value[type] + piece_square_value(type, square, color);
            score += color == WHITE ? value : -value;
        }
    }
    return position->side_to_move == WHITE ? score : -score;
}
