# -*- coding: utf-8 -*-
"""把 bp-rebooted 的 Alien 皮肤从上游图集里裁出来，重新打包成本 Mod 自带的图集。

用法（工程根目录下）：
    py "Assets/StreamingAssets/Mods/bpreboot-specials/Tools/pack_atlas.py"

产物（都在 ../Atlas/ 下）：
    bpreboot_skins.png      皮肤图集
    bpreboot_skins.txt      部件贴图条目（frame 是 {Name,Width,Height,Scale} 头）
    bpreboot_icons.txt      建造列表图标条目，键名直接就是 Part_<Type>_<Index>_Rendered

坐标来源：上游 Assets/TextAsset/IngameAtlas4_TextAsset.txt。Gatling 在 bp-rebooted 的
图集里是空的，改从 BPLE-2022.1.9 的同名图集取。
"""

import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow：py -m pip install pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
MOD = os.path.dirname(HERE)
OUT = os.path.join(MOD, "Atlas")

# 工程根 = 上溯到「同时有 Assets 和 Tools/BPRebooted」的那一层（bpsim-main 的父目录）
ROOT = MOD
while not (os.path.isdir(os.path.join(ROOT, "Assets"))
           and os.path.isdir(os.path.join(ROOT, "Tools", "BPRebooted"))):
    parent = os.path.dirname(ROOT)
    if parent == ROOT:
        sys.exit("找不到工程根（同时含 Assets 与 Tools/BPRebooted 的目录）")
    ROOT = parent

UP = os.path.join(ROOT, "Tools", "BPRebooted", "upstream")
ATLAS4 = os.path.join(UP, "bp-rebooted", "Assets", "Texture2D", "IngameAtlas4.png")
ATLAS4_ALT = os.path.join(UP, "BPLE-2022.1.9", "Assets", "Texture2D", "IngameAtlas4.png")

# (名字, x, y, w, h, 图集来源)  —— 坐标取自 IngameAtlas4_TextAsset.txt
SKINS = [
    ("AlienWoodenFrame",     512, 256, 105, 105, ATLAS4),
    ("AlienGlassFrame",      640,   0, 110, 110, ATLAS4),
    ("AlienEngineNormal",    640, 128,  90,  94, ATLAS4),
    ("AlienEngineBig",       768, 128, 114,  90, ATLAS4),
    ("AlienWheel",           142, 1288, 142, 140, ATLAS4),
    ("AlienSpoke",           284, 1288,  66,  64, ATLAS4),
    ("AlienSupport",         384,   0,  66,  65, ATLAS4),
    ("Piston",               640, 1024, 100, 100, ATLAS4),
    ("PistonHandle",         768, 1024, 100,  50, ATLAS4),
    ("LightningHook",        365, 1024, 106,  58, ATLAS4),
    ("AlienRapidGun",        768, 256, 210, 105, ATLAS4),
    ("AlienRapidGunExtended",768, 384, 210, 105, ATLAS4),
    ("RailGun",             1792, 1152, 228, 100, ATLAS4),
    ("HalfHorizontal",       127, 1024, 105,  66, ATLAS4),
    ("T60Triangle",            0, 1024, 105, 105, ATLAS4),
    ("T45Triangle",          255, 1024, 104, 104, ATLAS4),
    ("TungstenCube",         512, 1152, 106, 105, ATLAS4),
    ("AlienHyperPropeller",  512,   0,  54, 100, ATLAS4),
    ("AlienSantaSpring",     640, 256, 105, 105, ATLAS4),
    ("AlienMetalTNT",        512, 128, 100, 100, ATLAS4),
    # Gatling 在 bp-rebooted 的图集里全透明，像素只在 BPLE-2022.1.9 那边有。
    ("Gatling",                0, 924, 199,  55, ATLAS4_ALT),
]

# 皮肤图集缩放：和图集无关，SpriteManager 用它把像素换算成世界尺寸。
# 0.01302083 是 bpsim 主图集的取值，配合条目的 ScaleX/ScaleY = 0.4 得到 1 格 ≈ 1 单位。
ATLAS_SCALE = 0.01302083
SPRITE_SCALE = 0.4

# 图标另起一张「图集名」，共用同一张 PNG，但表头缩放是 0.4（与 Part_Rendered_SpriteMap_0 一致）。
ICON_ATLAS = "Bpreboot_Icons"
ICON_SCALE = 0.4

# 建造列表图标要引用的皮肤（键名 → 皮肤名）。键名必须是 Part_<Type>_<Index>_Rendered。
ICONS = [
    ("Part_5_9000_Rendered",  "AlienWoodenFrame"),
    ("Part_5_9001_Rendered",  "AlienGlassFrame"),
    ("Part_6_9000_Rendered",  "HalfHorizontal"),
    ("Part_6_9001_Rendered",  "T60Triangle"),
    ("Part_6_9002_Rendered",  "T45Triangle"),
    ("Part_6_9003_Rendered",  "TungstenCube"),
    ("Part_13_9000_Rendered", "AlienHyperPropeller"),
    ("Part_20_9000_Rendered", "AlienEngineNormal"),
    ("Part_21_9000_Rendered", "AlienEngineBig"),
    ("Part_24_9000_Rendered", "AlienSantaSpring"),
    ("Part_25_9000_Rendered", "AlienMetalTNT"),
    ("Part_37_9000_Rendered", "Piston"),
    ("Part_38_9000_Rendered", "AlienWheel"),
    ("Part_39_9000_Rendered", "AlienRapidGun"),
    ("Part_39_9001_Rendered", "AlienRapidGunExtended"),
    ("Part_39_9002_Rendered", "LightningHook"),
    ("Part_39_9003_Rendered", "RailGun"),
    ("Part_39_9004_Rendered", "Gatling"),
]

PADDING = 2


def shelf_pack(rects, width=1024):
    """按高度降序做简单的 shelf 打包，返回 {name: (x, y)}。"""
    order = sorted(rects, key=lambda r: -r[2])
    x = PADDING
    y = PADDING
    shelf_h = 0
    out = {}
    for name, w, h in order:
        if x + w + PADDING > width:
            x = PADDING
            y += shelf_h + PADDING
            shelf_h = 0
        out[name] = (x, y)
        x += w + PADDING
        shelf_h = max(shelf_h, h)
    return out, y + shelf_h + PADDING


def main():
    cache = {}

    def atlas(path):
        if path not in cache:
            if not os.path.isfile(path):
                sys.exit("找不到上游图集：" + path)
            cache[path] = Image.open(path).convert("RGBA")
        return cache[path]

    rects = [(name, w, h) for name, _x, _y, w, h, _src in SKINS]
    placed, height = shelf_pack(rects)
    canvas = Image.new("RGBA", (1024, height), (0, 0, 0, 0))

    for name, x, y, w, h, src in SKINS:
        canvas.paste(atlas(src).crop((x, y, x + w, y + h)), placed[name])

    os.makedirs(OUT, exist_ok=True)
    canvas.save(os.path.join(OUT, "bpreboot_skins.png"))

    with open(os.path.join(OUT, "bpreboot_skins.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("Bpreboot_Skins, %d, %d, %s\n" % (canvas.width, canvas.height, ATLAS_SCALE))
        for name, _x, _y, w, h, _src in SKINS:
            px, py = placed[name]
            f.write("%s, %d, %d, %d, %d, 0, 0, %s, %s\n"
                    % ("bpreboot/" + name, px, py, w, h, SPRITE_SCALE, SPRITE_SCALE))

    with open(os.path.join(OUT, "bpreboot_icons.txt"), "w", encoding="utf-8", newline="\n") as f:
        # 图标用独立的表头缩放（0.4，和原版 Part_Rendered_SpriteMap_0 一致）：
        # UISprite 把 VertexW/VertexH 直接写进 sizeDelta，0.01302083 会小到看不清。
        # 贴图是同一张 PNG，只是图集名不同，所以 Mod 里要注册两张「同名不同 scale」的图集。
        f.write("%s, %d, %d, %s\n" % (ICON_ATLAS, canvas.width, canvas.height, ICON_SCALE))
        for key, skin in ICONS:
            px, py = placed[skin]
            w = next(w for name, _x, _y, w, _h, _s in SKINS if name == skin)
            h = next(h for name, _x, _y, _w, h, _s in SKINS if name == skin)
            f.write("%s, %d, %d, %d, %d, 0, 0, 1, 1\n" % (key, px, py, w, h))

    print("图集 %dx%d，%d 张皮肤，%d 个图标" % (canvas.width, canvas.height, len(SKINS), len(ICONS)))


if __name__ == "__main__":
    main()
