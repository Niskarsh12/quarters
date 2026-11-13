# Dungeon Stake design

The entrance answers “Which character will I bring into the raid?” The ten original sprite characters are the primary selectable objects. A grass staging area sits opposite stone dungeon floors. Gold is reserved for ready/vote actions and the countdown. A large serif title sets the fantasy tone; the battle uses smaller functional headings, plain controls and an unobstructed chessboard.

The frontend design skill's inspector was run at 1440, 768 and 390 pixels. Initial issues fixed: every empty character incorrectly displayed “You”; labels below 11px; cramped tablet character rows; character card heights; the type-glyph logo replaced with a dedicated rook SVG. Final inspection: zero failures. The four warnings are intentional game-specific choices: a large entrance heading (not a dashboard), italic emphasis within the same serif, a small arena label, and warm parchment text matching the fantasy materials.

The chess component loads on demand; PNG sprite assets are tiny native-resolution sheets. No WebGL, heavy 3D or continuous render loop. Animation uses transforms and opacity with reduced-motion support. Match progression is server-owned rather than tied to browser visibility.

Clocks: 60 seconds per vote, 10 minutes cumulative per team. These are separate so an empty voting round can auto-play while a match can still end by timeout. Demo fast-forward is explicit and available only to hosts of rooms containing demo bots.
