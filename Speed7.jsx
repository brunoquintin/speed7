/*
================================================================================
    Speed7  v1.1
    A seven-button Easy Ease panel meant to be squeezed down to almost nothing.

    Adobe After Effects script (ExtendScript, based on ECMAScript 3).
    Author: Bruno Quintin
    Licence: CC0 1.0 Universal. To the extent possible under law, the author
    has waived all copyright and related rights to this work. Copy it, change
    it, ship it inside your own tools, with or without credit.

    Vibecoded script. Its use is offered without warranty; the user therefore
    assumes full responsibility for its use.
================================================================================

    WHAT IT DOES
    ------------
    Select keyframes, click a button, the temporal ease of every selected
    keyframe is set to that button's preset. Seven presets, one click each,
    no dialog, no options, no settings to remember.

    WHY IT EXISTS
    -------------
    The point of this script is the panel itself rather than the easing.
    Applying an ease is two lines of ExtendScript; keeping seven of them
    permanently reachable without giving up timeline space is the actual
    problem it solves.

    So the panel is built to survive being made very small. Dock it in the
    narrowest column of the workspace, or shrink the floating window down to
    a strip, and it stays usable:

      - The buttons have no fixed size. They fill whatever room the panel has
        and shrink with it, down to 16 x 16 pixels each.
      - The icons are vector drawings, not images. They are re-rendered at the
        button's current size every time the panel is resized, so the curve
        stays sharp and centred at any scale instead of turning into a blurry
        or clipped bitmap. The stroke thickness scales with them, so a tiny
        icon does not end up as a fat blob.
      - The button strip flips between a row and a column on its own. When the
        panel is taller than it is wide it stacks vertically, so it reads the
        same docked in a side column as floating above the timeline.

    THE SEVEN BUTTONS
    -----------------
    Left to right (top to bottom once the strip has flipped to a column), the
    curve on each icon is the speed graph it applies:

      1. Constant deceleration
      2. Influence   0% out / 100% in
      3. Influence  33% out / 100% in
      4. Influence  90% out /  90% in
      5. Influence 100% out /  33% in
      6. Influence 100% out /   0% in
      7. Constant acceleration

    Buttons 2 and 6 ask for 0% influence but are sent 0.1%, because After
    Effects rejects an influence of exactly zero. The difference is not
    visible on a curve and keeps the value inside the legal range.

    WHAT IS SKIPPED, AND WHY
    ------------------------
    Anything in the selection that cannot take an ease is passed over in
    silence: no dialog, no partial application, nothing written to it.

    - Property GROUPS. Clicking an "Effects" or "Transform" header selects
      the group, not its children, and a group holds no keyframes.
    - Properties that only ever accept HOLD keyframes: a Checkbox Control,
      an effect's dropdown menu. They are animatable and report a value type
      of OneD, exactly like Opacity, so the value type cannot tell them
      apart - only isInterpolationTypeValid(BEZIER) can. Trying anyway is
      what used to abort the whole click with "the BEZIER interpolation is
      not allowed for this property", leaving every other selected keyframe
      untouched and the undo group open.

    So the filter runs over the whole selection BEFORE any keyframe is
    written. Selecting a checkbox alongside a Position now eases the
    Position and ignores the checkbox, instead of failing on both.

    HOW THE ICONS ARE DRAWN
    -----------------------
    Each icon is a list of SVG path commands (moveTo, cubic curveTo) held in
    USER_SVG_PATHS, on a nominal 336 x 336 canvas. On every repaint the button
    computes a scale factor from its own current size, then drawPathCmds walks
    the commands, flattens each cubic Bezier into short line segments and
    strokes the result with the ScriptUI Graphics API. Nothing is cached and
    no image file ships alongside the script: the whole panel is this one .jsx.

    Icon, border and hover colours are picked once at startup from the After
    Effects UI brightness preference, so the panel matches a light or a dark
    interface theme.

    INSTALLATION
    ------------
    Dockable panel - it must go in the ScriptUI Panels folder to appear in the
    Window menu. Menu commands below are given in English; adapt them to
    whatever language your copy of After Effects is currently running in.
    1. Open After Effects.
    2. Go to File > Scripts > Install ScriptUI Panel...
    3. Restart After Effects.
    4. Open it from the Window menu, at the bottom: "Speed7.jsx".

    It can also be run without installing, via File > Scripts > Run Script
    File, in which case it opens as a floating palette instead of a dockable
    panel.
================================================================================
*/

(function (thisObj) {

    // Colors adapted to the AE theme (read once at startup)
    var isLight = false;
    try {
        var brightness = app.preferences.getPrefAsFloat(
            "Main Pref Section v2",
            "User Interface Brightness (4) [0.0..1.0]",
            PREFType.PREF_Type_MACHINE_INDEPENDENT
        );
        isLight = brightness > 0.5;
    } catch (e) {}
    var COLOR_ICON   = isLight ? [0.1,  0.1,  0.1,  1] : [0.8,  0.8,  0.8,  1];
    var COLOR_BORDER = isLight ? [0.45, 0.45, 0.45, 1] : [0.38, 0.38, 0.38, 1];
    var COLOR_HOVER  = isLight ? [0.65, 0.65, 0.65, 1] : [0.35, 0.35, 0.35, 1];

    var SVG_SIZE = 336;

    var USER_SVG_PATHS = {
        Btn_decelerate: [                                                   // codeSvg1 — diagonal ↘
            {t:"M", x:8,   y:8},
            {t:"L", x:328, y:328}
        ],
        Btn_ease2: [                                                        // codeSvg2 — ease-in
            {t:"M", x:8,   y:8},
            {t:"C", x1:8,     y1:221.33, x2:114.67, y2:328,    x:328, y:328}
        ],
        Btn_ease3: [                                                        // codeSvg3 — ease 33/100
            {t:"M", x:8,     y:327.88},
            {t:"C", x1:15.65, y1:310.97, x2:30.96,  y2:277.16, x:36.92,  y:246.57},
            {t:"C", x1:53.45, y1:161.71, x2:60.44,  y2:8.07,   x:70.01,  y:8},
            {t:"C", x1:85.50, y1:7.88,   x2:76.61,  y2:167.96, x:141.86, y:248.49},
            {t:"C", x1:197.27,y1:316.87, x2:285.00, y2:319.89, x:328.00, y:327.89}
        ],
        Btn_ease4: [                                                        // codeSvg4 — ease 90/90
            {t:"M", x:8,      y:327.87},
            {t:"C", x1:56.38, y1:327.87, x2:119.50, y2:316.87, x:137.30, y:286.10},
            {t:"C", x1:155.41,y1:254.80, x2:159.25, y2:205.95, x:161.84, y:162.96},
            {t:"C", x1:166.58,y1:84.09,  x2:161.50, y2:7.88,   x:167.99, y:8.00},
            {t:"C", x1:174.48,y1:7.88,   x2:169.40, y2:84.10,  x:174.14, y:162.96},
            {t:"C", x1:176.72,y1:205.95, x2:180.57, y2:254.80, x:198.68, y:286.10},
            {t:"C", x1:216.48,y1:316.87, x2:279.60, y2:327.87, x:327.98, y:327.87}
        ],
        Btn_ease5: [                                                        // codeSvg5 — ease 100/33
            {t:"M", x:328,    y:327.88},
            {t:"C", x1:320.35,y1:310.97, x2:305.04, y2:277.16, x:299.08, y:246.57},
            {t:"C", x1:282.55,y1:161.71, x2:275.56, y2:8.07,   x:265.99, y:8.00},
            {t:"C", x1:250.50,y1:7.88,   x2:259.39, y2:167.96, x:194.14, y:248.49},
            {t:"C", x1:138.73,y1:316.87, x2:51.00,  y2:319.89, x:8.00,   y:327.89}
        ],
        Btn_ease6: [                                                        // codeSvg6 — ease-out
            {t:"M", x:328, y:8},
            {t:"C", x1:328,   y1:221.33, x2:221.33, y2:328,    x:8,   y:328}
        ],
        Btn_accelerate: [                                                   // codeSvg7 — diagonal ↗
            {t:"M", x:328, y:8},
            {t:"L", x:8,   y:328}
        ]
    };

    // ─── Drawing ───────────────────────────────────────────────────────────────

    function drawPathCmds(g, cmds, px, py) {
        var cx = 0, cy = 0;
        g.newPath();
        for (var i = 0; i < cmds.length; i++) {
            var c = cmds[i];
            if (c.t === "M") {
                g.moveTo(px(c.x), py(c.y));
                cx = c.x; cy = c.y;
            } else if (c.t === "L") {
                g.lineTo(px(c.x), py(c.y));
                cx = c.x; cy = c.y;
            } else if (c.t === "C") {
                for (var j = 1; j <= 20; j++) {
                    var t = j / 20, mt = 1 - t;
                    var bx = mt*mt*mt*cx + 3*mt*mt*t*c.x1 + 3*mt*t*t*c.x2 + t*t*t*c.x;
                    var by = mt*mt*mt*cy + 3*mt*mt*t*c.y1 + 3*mt*t*t*c.y2 + t*t*t*c.y;
                    g.lineTo(px(bx), py(by));
                }
                cx = c.x; cy = c.y;
            }
        }
    }

    function addEaseButton(parent, cmds, tip) {
        var btn = parent.add("group");
        btn.minimumSize = [16, 16];
        btn.alignment   = ["fill", "fill"];
        btn.helpTip     = tip || "";
        btn.hovered     = false;

        // g.backgroundColor automatically triggers the repaint (calls onDraw)
        var g        = btn.graphics;
        var bgNormal = g.newBrush(g.BrushType.SOLID_COLOR, [0.18, 0.18, 0.18, 1]);
        var bgHover  = g.newBrush(g.BrushType.SOLID_COLOR, [0.38, 0.38, 0.38, 1]);
        g.backgroundColor = bgNormal;

        btn.onDraw = function () {
            var w = this.size[0], h = this.size[1];
            var g = this.graphics;

            // Hover background — drawn here because g.backgroundColor is not rendered when onDraw is defined.
            if (btn.hovered) {
                g.newPath();
                g.moveTo(0, 0);
                g.lineTo(w, 0);
                g.lineTo(w, h);
                g.lineTo(0, h);
                g.lineTo(0, 0);
                g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, COLOR_HOVER));
            }

            // Border
            g.newPath();
            g.moveTo(0.5, 0.5);
            g.lineTo(w - 0.5, 0.5);
            g.lineTo(w - 0.5, h - 0.5);
            g.lineTo(0.5, h - 0.5);
            g.lineTo(0.5, 0.5);
            g.strokePath(g.newPen(g.PenType.SOLID_COLOR, COLOR_BORDER, 1));

            // SVG icon
            var pad = 4;
            var s  = Math.min((w - pad * 2) / SVG_SIZE, (h - pad * 2) / SVG_SIZE);
            var ox = (w - SVG_SIZE * s) / 2;
            var oy = (h - SVG_SIZE * s) / 2;

            function px(x) { return ox + x * s; }
            function py(y) { return oy + y * s; }

            drawPathCmds(g, cmds, px, py);
            var sw = Math.max(1, Math.round(16 * s));
            g.strokePath(g.newPen(g.PenType.SOLID_COLOR, COLOR_ICON, sw));
        };

        btn.addEventListener("mouseover", function () {
            btn.hovered = true;
            btn.graphics.backgroundColor = bgHover;
        });

        btn.addEventListener("mouseout", function () {
            btn.hovered = false;
            btn.graphics.backgroundColor = bgNormal;
        });

        btn.addEventListener("click", function () {
            if (typeof btn.onClick === "function") btn.onClick();
        });

        return btn;
    }

    // ─── Interpolation logic ───────────────────────────────────────────────

    // selectedProperties also returns property GROUPS (clicking an "Effects"
    // or "Transform" header), which hold no value and no keyframes at all.
    // And some perfectly animatable properties only ever accept HOLD keys: a
    // Checkbox Control, an effect's dropdown menu. Those report a
    // propertyValueType of OneD, exactly like Opacity does, so the value type
    // tells us nothing - isInterpolationTypeValid is the only reliable test.
    // Feeding either kind to setTemporalEaseAtKey throws "the BEZIER
    // interpolation is not allowed for this property", so both are filtered
    // out before anything is touched.
    function isEaseable(prop, needsLinear) {
        try {
            if (prop.propertyType !== PropertyType.PROPERTY) return false;
            if (!prop.canVaryOverTime) return false;
            if (!prop.isInterpolationTypeValid(KeyframeInterpolationType.BEZIER)) return false;
            if (needsLinear && !prop.isInterpolationTypeValid(KeyframeInterpolationType.LINEAR)) return false;
        } catch (e) {
            return false;   // Unknown property shape - leave it alone rather than risk throwing.
        }
        return true;
    }

    // needsLinear is true for the two constant-speed buttons, which also call
    // setInterpolationTypeAtKey(k, LINEAR) and would throw on the same
    // properties for the LINEAR type instead of the BEZIER one.
    function getEaseableProps(needsLinear) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) {
            alert("Please open a composition and select keyframes.");
            return null;
        }
        var all = comp.selectedProperties;
        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (isEaseable(all[i], needsLinear)) result.push(all[i]);
        }
        return result;
    }

    function makeFlatEaseArray(referenceArray, influence) {
        var result = [];
        for (var i = 0; i < referenceArray.length; i++) {
            result.push(new KeyframeEase(0, influence));
        }
        return result;
    }

    function decelerate() {
        var props = getEaseableProps(true);
        if (!props || props.length === 0) return;
        app.beginUndoGroup("Speed7");
        try {
            for (var i = 0; i < props.length; i++) {
                var prop = props[i];
                var keys = prop.selectedKeys;
                if (!keys || keys.length === 0) continue;
                for (var j = 0; j < keys.length; j++) {
                    var k = keys[j];
                    var easeIn  = prop.keyInTemporalEase(k);
                    var easeOut = prop.keyOutTemporalEase(k);
                    var easeInArray  = easeIn;
                    var easeOutArray = easeOut;
                    prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR);
                    if (k !== prop.numKeys && prop.keySelected(k + 1)) {
                        easeOutArray = [];
                        for (var n = 0; n < easeOut.length; n++) {
                            var speedOut = prop.keyOutTemporalEase(k)[n].speed;
                            easeOutArray.push(new KeyframeEase(speedOut * 2, 100 / 3));
                        }
                    }
                    if (k !== 1 && prop.keySelected(k - 1)) {
                        easeInArray = makeFlatEaseArray(easeIn, 100 / 3);
                    }
                    prop.setTemporalEaseAtKey(k, easeInArray, easeOutArray);
                }
            }
        } finally {
            app.endUndoGroup();
        }
    }

    function accelerate() {
        var props = getEaseableProps(true);
        if (!props || props.length === 0) return;
        app.beginUndoGroup("Speed7");
        try {
            for (var i = 0; i < props.length; i++) {
                var prop = props[i];
                var keys = prop.selectedKeys;
                if (!keys || keys.length === 0) continue;
                for (var j = 0; j < keys.length; j++) {
                    var k = keys[j];
                    var easeIn  = prop.keyInTemporalEase(k);
                    var easeOut = prop.keyOutTemporalEase(k);
                    var easeInArray  = easeIn;
                    var easeOutArray = easeOut;
                    prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR);
                    if (k !== 1 && prop.keySelected(k - 1)) {
                        easeInArray = [];
                        for (var n = 0; n < easeIn.length; n++) {
                            var speedIn = prop.keyInTemporalEase(k)[n].speed;
                            easeInArray.push(new KeyframeEase(speedIn * 2, 100 / 3));
                        }
                    }
                    if (k !== prop.numKeys && prop.keySelected(k + 1)) {
                        easeOutArray = makeFlatEaseArray(easeOut, 100 / 3);
                    }
                    prop.setTemporalEaseAtKey(k, easeInArray, easeOutArray);
                }
            }
        } finally {
            app.endUndoGroup();
        }
    }

    function ease(influIn, influOut) {
        var props = getEaseableProps(false);
        if (!props || props.length === 0) return;
        app.beginUndoGroup("Speed7");
        try {
            for (var i = 0; i < props.length; i++) {
                var prop = props[i];
                var keys = prop.selectedKeys;
                if (!keys || keys.length === 0) continue;
                for (var j = 0; j < keys.length; j++) {
                    var k       = keys[j];
                    var easeIn  = makeFlatEaseArray(prop.keyInTemporalEase(k),  influIn);
                    var easeOut = makeFlatEaseArray(prop.keyOutTemporalEase(k), influOut);
                    prop.setTemporalEaseAtKey(k, easeIn, easeOut);
                }
            }
        } finally {
            app.endUndoGroup();
        }
    }

    // ─── Interface ────────────────────────────────────────────────────────────

    function buildUI(parent) {
        var panel = (parent instanceof Panel)
            ? parent
            : new Window("palette", "Speed7", undefined, { resizeable: true });
        if (!panel) return panel;

        panel.orientation   = "column";
        panel.alignChildren = ["fill", "fill"];
        panel.spacing = 2;
        panel.margins = 2;

        var row = panel.add("group");
        row.orientation   = "row";
        row.alignChildren = ["fill", "fill"];
        row.spacing = 2;
        row.margins = 2;

        var btnDecelerate = addEaseButton(row, USER_SVG_PATHS.Btn_decelerate, "Constant deceleration");
        var btnEase2      = addEaseButton(row, USER_SVG_PATHS.Btn_ease2,      "Influence 0% out 100% in");
        var btnEase3      = addEaseButton(row, USER_SVG_PATHS.Btn_ease3,      "Influence 33% out 100% in");
        var btnEase4      = addEaseButton(row, USER_SVG_PATHS.Btn_ease4,      "Influence 90% out 90% in");
        var btnEase5      = addEaseButton(row, USER_SVG_PATHS.Btn_ease5,      "Influence 100% out 33% in");
        var btnEase6      = addEaseButton(row, USER_SVG_PATHS.Btn_ease6,      "Influence 100% out 0% in");
        var btnAccelerate = addEaseButton(row, USER_SVG_PATHS.Btn_accelerate, "Constant acceleration");

        btnDecelerate.onClick = function () { decelerate(); };
        btnEase2.onClick      = function () { ease(100, 0.1); };
        btnEase3.onClick      = function () { ease(100, 100 / 3); };
        btnEase4.onClick      = function () { ease(90, 90); };
        btnEase5.onClick      = function () { ease(100 / 3, 100); };
        btnEase6.onClick      = function () { ease(0.1, 100); };
        btnAccelerate.onClick = function () { accelerate(); };

        function reOrientButtons() {
            var width = 0, height = 0;
            if (panel.windowBounds) {
                width  = panel.windowBounds.width;
                height = panel.windowBounds.height;
            }
            if ((!width || !height) && panel.size) {
                width  = panel.size[0];
                height = panel.size[1];
            }
            row.orientation = (height > width) ? "column" : "row";
            panel.layout.layout(true);
            panel.layout.resize();
        }

        panel.layout.layout(true);
        reOrientButtons();
        panel.onResizing = panel.onResize = reOrientButtons;

        return panel;
    }

    var easyEaseUI = buildUI(thisObj);
    if (easyEaseUI instanceof Window) {
        easyEaseUI.center();
        easyEaseUI.show();
    }

})(this);
