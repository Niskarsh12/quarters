# Dungeon Football design

The pitch is the main match view. Stone tiles, torchlight, and the existing pixel characters carry the dungeon setting. Teal and coral ground markers identify the teams. A small marker above your character identifies your seat in a crowd.

The playfield uses a fixed 640×360 Canvas 2D buffer with pixelated scaling, a cached background, and interpolated movement. Match scores and the countdown stay outside the canvas as HTML. Desktop controls use movement keys and Space. Touch controls use a directional pad and a Kick button.
