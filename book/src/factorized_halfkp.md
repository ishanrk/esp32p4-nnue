# King Conditioned Features

The baseline is inspired by HalfKP but does not use an exact king-square index.
Instead, each perspective conditions its nonking piece-square features on one
of eight mirrored king buckets.

For a perspective, pieces of that color use five pawn-through-queen classes and
opposing pieces use another five. Kings are excluded. The feature index inside
a bucket is:

    piece class times 64 plus perspective oriented square

The bucket offset adds bucket times 640. Black's perspective rank-mirrors every
square so the same weights describe both board orientations.

This factorization gives incremental updates their useful property: moving a
nonking piece changes one feature vector in each perspective. A king move only
requires a perspective rebuild if its bucket changes in principle; the current
make path conservatively refreshes that king's perspective after every king
move while preserving the same bucketed architecture.

The hidden width remains 64 and activation remains clipped ReLU. Experiments
with 16 buckets, width 128, intermediate sub-1-MB designs, and SCReLU are
deliberately outside the current baseline.
