#ifndef P4_CH_H
#define P4_CH_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "nnue_config.h"

typedef uint64_t bitboard_t;
typedef uint32_t move_t;

_Static_assert(sizeof(uint8_t) == 1, "uint8 size");
_Static_assert(sizeof(int8_t) == 1, "int8 size");
_Static_assert(sizeof(uint16_t) == 2, "uint16 size");
_Static_assert(sizeof(int16_t) == 2, "int16 size");
_Static_assert(sizeof(uint32_t) == 4, "uint32 size");
_Static_assert(sizeof(int32_t) == 4, "int32 size");
_Static_assert(sizeof(uint64_t) == 8, "uint64 size");
_Static_assert(sizeof(bitboard_t) == 8, "bitboard size");
_Static_assert(sizeof(move_t) == 4, "move size");

enum { WHITE, BLACK, COLOR_COUNT };
enum { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, PIECE_TYPE_COUNT };
enum {
    WHITE_PAWN,
    WHITE_KNIGHT,
    WHITE_BISHOP,
    WHITE_ROOK,
    WHITE_QUEEN,
    WHITE_KING,
    BLACK_PAWN,
    BLACK_KNIGHT,
    BLACK_BISHOP,
    BLACK_ROOK,
    BLACK_QUEEN,
    BLACK_KING,
    PIECE_COUNT,
    NO_PIECE = 255
};
enum { ALL_PIECES = 2 };
enum {
    CASTLE_WHITE_KING = 1,
    CASTLE_WHITE_QUEEN = 2,
    CASTLE_BLACK_KING = 4,
    CASTLE_BLACK_QUEEN = 8
};
enum {
    MOVE_CAPTURE = 1,
    MOVE_EN_PASSANT = 2,
    MOVE_CASTLE = 4,
    MOVE_DOUBLE_PAWN = 8
};
enum { TT_EXACT, TT_LOWER_BOUND, TT_UPPER_BOUND };
enum {
    NO_SQUARE = 64,
    MAX_MOVES = 256,
    MAX_PLY = 128,
    POSITION_HISTORY_SIZE = 256
};
enum {
    NNUE_FORMAT_VERSION = 3,
    NNUE_PERSPECTIVE_COUNT = 2,
    NNUE_BUCKET_COUNT = P4_NNUE_BUCKET_COUNT,
    NNUE_FEATURES_PER_BUCKET = 640,
    NNUE_HIDDEN_SIZE = P4_NNUE_HIDDEN_SIZE,
    NNUE_FEATURE_COUNT = NNUE_BUCKET_COUNT * NNUE_FEATURES_PER_BUCKET,
    NNUE_FEATURE_WEIGHT_COUNT = NNUE_FEATURE_COUNT * NNUE_HIDDEN_SIZE,
    NNUE_MAX_ACTIVE_FEATURES = 30,
    NNUE_ACTIVATION_CLIP = 127,
    NNUE_FEATURE_QUANTIZATION = 64,
    NNUE_OUTPUT_QUANTIZATION = 64,
    NNUE_ACCUMULATOR_BIAS_MIN = -28928,
    NNUE_ACCUMULATOR_BIAS_MAX = 28957
};

#define NNUE_MAGIC "P4NNUE1"

enum {
    NNUE_MAGIC_OFFSET = 0,
    NNUE_MAGIC_SIZE = 8,
    NNUE_VERSION_OFFSET = 8,
    NNUE_BUCKET_COUNT_OFFSET = 10,
    NNUE_FEATURES_PER_BUCKET_OFFSET = 12,
    NNUE_HIDDEN_SIZE_OFFSET = 14,
    NNUE_ACTIVATION_CLIP_OFFSET = 16,
    NNUE_FEATURE_QUANTIZATION_OFFSET = 18,
    NNUE_OUTPUT_QUANTIZATION_OFFSET = 20,
    NNUE_PERSPECTIVE_COUNT_OFFSET = 22,
    NNUE_FILE_SIZE_OFFSET = 24,
    NNUE_HEADER_SIZE = 28,
    NNUE_OUTPUT_BIAS_OFFSET = NNUE_HEADER_SIZE,
    NNUE_OUTPUT_BIAS_SIZE = 4,
    NNUE_FEATURE_BIAS_OFFSET =
        NNUE_OUTPUT_BIAS_OFFSET + NNUE_OUTPUT_BIAS_SIZE,
    NNUE_OUTPUT_WEIGHTS_OFFSET =
        NNUE_FEATURE_BIAS_OFFSET + NNUE_HIDDEN_SIZE * 2,
    NNUE_FEATURE_WEIGHTS_OFFSET =
        NNUE_OUTPUT_WEIGHTS_OFFSET + 2 * NNUE_HIDDEN_SIZE * 2,
    NNUE_FILE_SIZE =
        NNUE_FEATURE_WEIGHTS_OFFSET + NNUE_FEATURE_WEIGHT_COUNT
};

#define SQUARE_BIT(square) (UINT64_C(1) << (square))
#define MAKE_SQUARE(file, rank) ((rank) * 8 + (file))
#define PACK_MOVE(from, to, promotion, flags) \
    ((move_t)((from) | ((to) << 6) | ((promotion) << 12) | ((flags) << 15)))
#define MOVE_FROM(move) ((int)((move) & 63u))
#define MOVE_TO(move) ((int)(((move) >> 6) & 63u))
#define MOVE_PROMOTION(move) ((int)(((move) >> 12) & 7u))
#define MOVE_FLAGS(move) ((int)(((move) >> 15) & 15u))

static inline int piece_color(int piece) { return piece >= BLACK_PAWN; }
static inline int piece_type(int piece) { return piece % PIECE_TYPE_COUNT; }
static inline int bit_count(bitboard_t bits) { return __builtin_popcountll(bits); }
static inline int first_square(bitboard_t bits) { return __builtin_ctzll(bits); }
static inline int pop_first_square(bitboard_t *bits) {
    int square = first_square(*bits);
    *bits &= *bits - 1;
    return square;
}

typedef struct {
    move_t moves[MAX_MOVES];
    int count;
} move_list_t;

typedef struct {
    bitboard_t pieces[PIECE_COUNT];
    bitboard_t occupancy[3];
    uint64_t key;
    uint64_t history[POSITION_HISTORY_SIZE];
    int16_t accumulator[COLOR_COUNT][NNUE_HIDDEN_SIZE];
    uint8_t board[64];
    uint16_t halfmove_clock;
    uint16_t fullmove_number;
    uint16_t history_count;
    uint8_t king_bucket[COLOR_COUNT];
    uint8_t king_mirror[COLOR_COUNT];
    uint8_t side_to_move;
    uint8_t castling;
    uint8_t en_passant;
} position_t;

typedef struct {
    uint64_t key;
    uint16_t halfmove_clock;
    uint16_t fullmove_number;
    uint16_t history_count;
    uint8_t castling;
    uint8_t en_passant;
    uint8_t king_bucket;
    uint8_t king_mirror;
    uint8_t moved_piece;
    uint8_t captured_piece;
} undo_t;

typedef struct {
    uint64_t key;
    move_t move;
    int16_t score;
    int8_t depth;
    uint8_t flag;
} tt_entry_t;

_Static_assert(sizeof(tt_entry_t) == 16, "transposition entry size");

typedef struct {
    tt_entry_t *entries;
    size_t count;
} transposition_table_t;

typedef struct {
    int depth;
    uint64_t move_time_ms;
} search_limits_t;

typedef struct {
    move_t best_move;
    move_t pv[MAX_PLY];
    int pv_count;
    int score;
    int depth;
    uint64_t nodes;
    uint64_t elapsed_ms;
} search_result_t;

typedef void (*search_info_fn)(const search_result_t *result, void *context);

extern bitboard_t knight_attacks[64];
extern bitboard_t king_attacks[64];
extern bitboard_t pawn_attacks[COLOR_COUNT][64];
extern uint64_t zobrist_piece[PIECE_COUNT][64];
extern uint64_t zobrist_castling[16];
extern uint64_t zobrist_en_passant[8];
extern uint64_t zobrist_side;

void initialize_chess(void);
bitboard_t generate_bishop_attacks(int square, bitboard_t occupancy);
bitboard_t generate_rook_attacks(int square, bitboard_t occupancy);

void clear_position(position_t *position);
void set_start_position(position_t *position);
bool set_position_fen(position_t *position, const char *fen);
bool position_is_valid(const position_t *position);
int find_king_square(const position_t *position, int color);
bool square_is_attacked(const position_t *position, int square, int by_color);
bool side_in_check(const position_t *position, int color);
uint64_t calculate_position_hash(const position_t *position);

void generate_moves(const position_t *position, move_list_t *list, bool tactical_only);
bool make_move(position_t *position, move_t move, undo_t *undo);
void undo_move(position_t *position, move_t move, const undo_t *undo);
move_t parse_uci_move(position_t *position, const char *text);
void move_to_uci(move_t move, char output[6]);
uint64_t perft(position_t *position, int depth);

bool load_nnue(const char *path);
bool bind_nnue(const void *data, size_t size);
void unload_nnue(void);
bool nnue_is_loaded(void);
int nnue_king_bucket(int king_square, int perspective);
bool nnue_king_mirror(int king_square, int perspective);
int nnue_feature_index(int king_square,
                       int piece,
                       int square,
                       int perspective);
void refresh_nnue(position_t *position);
void refresh_nnue_perspective(position_t *position, int perspective);
void add_nnue_feature(position_t *position, int piece, int square);
void remove_nnue_feature(position_t *position, int piece, int square);
int evaluate_nnue(const position_t *position);

int evaluate(const position_t *position);

bool resize_transposition_table(transposition_table_t *table, size_t megabytes);
bool resize_transposition_table_bytes(transposition_table_t *table, size_t bytes);
void free_transposition_table(transposition_table_t *table);
void clear_transposition_table(transposition_table_t *table);
search_result_t search_position(position_t *position,
                                transposition_table_t *table,
                                search_limits_t limits,
                                search_info_fn info,
                                void *context);

uint64_t current_time_ms(void);
void run_uci_loop(transposition_table_t *table);

#endif
