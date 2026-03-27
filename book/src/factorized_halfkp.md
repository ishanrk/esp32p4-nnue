# King Conditioned Features

The selected 8x64 baseline is inspired by HalfKP but does not use an exact
king-square index.
Instead, each perspective conditions its nonking piece-square features on one
of eight mirrored king buckets.

Normalization is performed independently for White and Black. The White view
starts with the board coordinates unchanged. The Black view first flips every
square vertically with `square xor 56`, placing Black's home rank at the bottom.
If the normalized king is on files e through h, the king and every nonking piece
square are then flipped horizontally with `square xor 7`. The king therefore
always finishes on normalized files a through d and every feature in that view
uses the same orientation.

The normalized king file selects zero through three. The selected profile adds
four when the normalized king rank is in the upper half of the board. This
produces eight buckets: four files times two rank halves. Reproducible 4-bucket
and 16-bucket experiment profiles use the same files with one full-rank band or
four two-rank bands. The profile comparison page defines those regions and
records their measured costs.

For a perspective, pieces of that color use five pawn-through-queen classes and
opposing pieces use another five. Kings are excluded because the bucket already
represents the view's king. The full sparse feature index is:

    bucket times 640 plus piece class times 64 plus normalized square

The piece classes are own pawn, knight, bishop, rook, queen followed by opponent
pawn, knight, bishop, rook, queen. A perspective has 8 times 640 or 5,120
possible features, with no more than 30 active in an ordinary legal position.

This factorization gives incremental updates their useful property: moving a
nonking piece removes one feature vector and adds another in each perspective.
A king move rebuilds only its own perspective when either its bucket or its
horizontal orientation changes. A move inside one bucket and orientation does
not rebuild because the king itself has no sparse feature. Moving between d and
e changes the horizontal orientation even though both kings share the learned
file-three bucket, so that boundary correctly requires a rebuild.

nnue_king_mirror receives a king square and perspective and reports the
horizontal orientation. nnue_king_bucket returns its normalized bucket.
nnue_feature_index receives the view king, colored nonking piece, piece square,
and perspective and returns the complete zero-through-5119 index. The C runtime
and train/features.py implement these same operations, and both consume the
expected values in test/nnue_features.txt.

The selected hidden width remains 64 and activation remains clipped ReLU. The
completed constrained comparison varies only buckets and width. SCReLU and an
uncontrolled architecture search remain outside the current baseline.
