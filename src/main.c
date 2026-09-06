#include "ch.h"

#include <stdio.h>
#include <string.h>


int main(int argc, char **argv) {
	const char *model_path = NULL;
	if (argc == 3 && !strcmp(argv[1], "--model")) model_path = argv[2];
	else if (argc != 1 && !(argc == 2 && !strcmp(argv[1], "--classical"))) {
		fprintf(stderr, "usage: p4nnue [--model PATH | --classical]\n");
		return 2;
	}
    transposition_table_t table = {0};
    initialize_chess();
	if (model_path && !load_nnue(model_path)) {
		fprintf(stderr, "model load failed: %s\n", model_path);
		return 1;
	}
	if (!resize_transposition_table(&table, 1)) {
		fprintf(stderr, "hash allocation failed\n");
		unload_nnue();
		return 1;
	}
	fprintf(stderr, "evaluator %s%s\n", model_path ? "nnue " : "classical", model_path ? model_path : "");
    run_uci_loop(&table, model_path);
    free_transposition_table(&table);
    unload_nnue();
    return 0;
}
