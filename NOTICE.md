# Third-party notices and corresponding source

Open Knight is an independent implementation, not affiliated with ChessSolve, Chess.com, Lichess, Mozilla, or the Stockfish team. No ChessSolve assets or proprietary code are included.

- Open Knight: GNU GPL v3 or later. See LICENSE.
- Stockfish.js 19.0.1 by Nathan Rugg and contributors: GPL v3. Upstream: https://github.com/nmrugg/stockfish.js/tree/0d5dd7944f88c817c07a26bc4fb1905d5f9c46d6 . The unmodified corresponding source, Makefile, network identifiers and build/download scripts are included as `app/engines/stockfish.js-19.0.1-source.tar.gz` in distributed builds, and `vendor-source/stockfish.js-19.0.1.tar.gz` in the project source. See its README, build.js, src/Makefile, src/nnue, scripts and AUTHORS. Emscripten and network download instructions are in that source. These builds are the official single-threaded Lite and Full WASM flavors from the pinned npm package; they are not modified. The source archive excludes generated binaries and redistributable network files retrieved by the upstream download script. Binary SHA-256 values are included alongside each engine.
- Stockfish neural networks and contributors: see the engine source's network documentation and the upstream Stockfish project. The upstream download script identifies the required network hashes.
- chess.js 1.4.0 by Jeff Hlywa and contributors: BSD-2-Clause. See CHESS-JS-LICENSE in distributions and https://github.com/jhlywa/chess.js .
- fflate is a development-only packaging dependency under MIT. esbuild is MIT. web-ext is MPL-2.0. jsdom is MIT. Their licenses remain in their npm packages.

The move-quality formula is Open Knight's heuristic. It does not reproduce Chess.com's or ChessSolve's proprietary accuracy methods. Candidate analyses can have different completed depths under a time limit; each line displays its actual depth.
