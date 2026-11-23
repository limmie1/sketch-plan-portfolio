"""生成 tabBar 图标（81×81 PNG，透明底），纯标准库实现，无需 PIL。
时间轴图标：三条横线 + 两个圆点，与网页版 nav 里的 SVG 同构。"""
import zlib, struct, math, os

SIZE = 81
SS = 4  # 超采样倍数

def png_bytes(w, h, rgba_rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rgba_rows)
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    dx, dy = px - (ax + t * vx), py - (ay + t * vy)
    return math.hypot(dx, dy)

def draw(color_rgb):
    W = SIZE * SS
    # 与 24 视口同比例（×SIZE/24）
    k = SIZE / 24.0
    r = 1.0 * k * 1.55  # 描边半径（线宽 2，同 SVG stroke-width=2）
    lines = [(4, 7.5, 13, 7.5), (4, 12, 17, 12), (4, 16.5, 10, 16.5)]
    dots = [(17.3, 7.5, 1.9), (10, 16.5, 1.9)]

    rows = []
    for y in range(SIZE):
        row = []
        for x in range(SIZE):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    px = (x * SS + sx + .5) / SS
                    py = (y * SS + sy + .5) / SS
                    inside = False
                    for (ax, ay, bx, by) in lines:
                        if seg_dist(px, py, ax * k, ay * k, bx * k, by * k) <= r:
                            inside = True
                            break
                    if not inside:
                        for (cx, cy, cr) in dots:
                            if math.hypot(px - cx * k, py - cy * k) <= cr * k:
                                inside = True
                                break
                    if inside:
                        hits += 1
            a = int(round(255 * hits / (SS * SS)))
            row.extend([color_rgb[0], color_rgb[1], color_rgb[2], a])
        rows.append(row)
    return png_bytes(SIZE, SIZE, rows)

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "miniprogram", "images")
    pairs = [(("tab-tl.png"), (0x94, 0x8B, 0x7A)), (("tab-tl-on.png"), (0xD9, 0x50, 0x3A))]
    for name, rgb in pairs:
        p = os.path.join(out, name)
        with open(p, "wb") as f:
            f.write(draw(rgb))
        print(name, os.path.getsize(p), "bytes")
