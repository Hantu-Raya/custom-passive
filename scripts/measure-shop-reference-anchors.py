#!/usr/bin/env python3
"""Measure shop captures; requires Python 3, opencv-python, Pillow and NumPy."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import cv2
import numpy as np
from PIL import Image


CAPTURE_NAMES = (
    "tab_weapon", "tab_spirit", "tab_vitality", "tab_popular", "tab_builds",
    "all_items_00", "all_items_01", "all_items_02", "all_items_03",
    "popular_silver_00", "popular_abrams_00", "menu_Physical", "menu_Spirit",
    "menu_Defense", "menu_Mobility", "menu_Disruption", "menu_Misc",
    "flt_Physical_Ammo_00",
)
FRAME = {"w": 1600, "h": 900}
ICON_SIZE = 60
MATCH_THRESHOLD = 0.88
ROOT = Path(__file__).resolve().parents[1]


def rect(x, y, w, h):
    return {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}


def components(mask):
    _, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8), connectivity=8
    )
    return labels, stats


def largest_component(mask, offset_x=0, offset_y=0, min_area=0):
    _, stats = components(mask)
    candidates = [row for row in stats[1:] if int(row[4]) > min_area]
    if not candidates:
        raise ValueError("No connected component found for reference region")
    x, y, w, h, _ = max(candidates, key=lambda row: int(row[4]))
    return rect(x + offset_x, y + offset_y, w, h)


def read_capture(path):
    with Image.open(path) as image:
        if image.size != (FRAME["w"], FRAME["h"]):
            raise ValueError(f"{path}: expected 1600x900, got {image.size}")
        return cv2.cvtColor(np.array(image.convert("RGB")), cv2.COLOR_RGB2BGR)


def load_catalog():
    source = (
        "import { DEADLOCK_ITEMS } from './src/data/deadlockItems.generated.js';"
        "console.log(JSON.stringify(DEADLOCK_ITEMS.map(({id, category, tier}) =>"
        "({id, category, tier}))));"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", source],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    catalog = json.loads(result.stdout)
    if len(catalog) != 156 or len({item["id"] for item in catalog}) != 156:
        raise ValueError("Expected 156 unique catalog items")
    return {item["id"]: item for item in catalog}


def build_templates(captures, catalog, images):
    sources = json.loads((captures / "icon_template_sources.json").read_text())
    if set(sources) != set(catalog):
        raise ValueError("Icon template sources must cover exactly the 156 catalog ids")
    templates = {}
    for item_id in sorted(catalog):
        source = sources[item_id]
        name = Path(source["capture"]).stem
        if name not in images:
            images[name] = read_capture(captures / source["capture"])
        x, y = int(source["x"]), int(source["y"])
        if x < 0 or y < 0:
            raise ValueError(f"{item_id}: negative icon source coordinates")
        template = images[name][y:y + ICON_SIZE, x:x + ICON_SIZE].copy()
        if template.shape != (ICON_SIZE, ICON_SIZE, 3):
            raise ValueError(f"{item_id}: icon source is outside the capture")
        templates[item_id] = template
    return templates


def measure_board(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return largest_component(gray[0:900, 500:1450] > 60, offset_x=500)


def measure_tabs(hsv):
    rail = hsv[0:900, 460:535]
    hue, saturation, value = cv2.split(rail)
    bright = value > 100
    # The active-board edge crosses the whole strip: exclude its long columns.
    bright[:, np.mean(bright, axis=0) > 0.65] = False
    saturated = (saturation > 80) & bright
    tabs = []
    # Segment the five rail colours separately so neighbouring backgrounds do
    # not join them. All Items is neutral and needs a low-saturation segment.
    for colour in (9, 23, 43, 95, 138, None):
        if colour is None:
            mask = (saturation <= 80) & bright
        else:
            distance = np.abs(hue.astype(np.int16) - colour)
            mask = saturated & (np.minimum(distance, 180 - distance) <= 6)
        tabs.append(largest_component(mask, offset_x=460, min_area=1500))
    return sorted(tabs, key=lambda tab: (tab["y"], tab["x"]))


def measure_menu(hsv):
    # The selected header supplies the category colour and horizontal anchor;
    # this also distinguishes the tan Misc menu from the Weapon column header.
    header = hsv[30:65, 540:1400]
    labels, stats = components((header[:, :, 1] > 100) & (header[:, :, 2] > 100))
    if len(stats) < 2:
        raise ValueError("No coloured active filter header found")
    component = max(range(1, len(stats)), key=lambda index: int(stats[index, 4]))
    header_x, _, header_w, _, _ = stats[component]
    category_hue = int(np.median(header[:, :, 0][labels == component]))
    region = hsv[80:900, 540:1400]
    distance = np.abs(region[:, :, 0].astype(np.int16) - category_hue)
    mask = (np.minimum(distance, 180 - distance) <= 3) & (region[:, :, 1] > 100)
    labels, stats = components(mask)
    candidates = []
    for index, row in enumerate(stats[1:], start=1):
        x, y, w, h, area = map(int, row)
        if y > 3 or x + w <= header_x or x >= header_x + header_w:
            continue
        if float(np.mean(region[:, :, 1][labels == index])) > 100:
            candidates.append((area, x, y, w, h))
    if not candidates:
        raise ValueError("No category-coloured menu component found below y=80")
    _, x, y, w, h = max(candidates)
    return rect(x + 540, y + 80, w, h)


def measure_cards(image, name, templates, catalog):
    # Category T2 icons start above y=140; include that row for full coverage.
    top = 60 if name in ("tab_weapon", "tab_spirit", "tab_vitality") else 140
    bottom = 712 if name.startswith("flt_") else 900
    region = image[top:bottom, 540:1420]
    candidates = []
    for item_id, template in templates.items():
        scores = cv2.matchTemplate(region, template, cv2.TM_CCOEFF_NORMED)
        ys, xs = np.where(scores >= MATCH_THRESHOLD)
        for y, x in zip(ys, xs):
            candidates.append({
                "id": item_id,
                **rect(x + 540, y + top, ICON_SIZE, ICON_SIZE),
                "score": float(scores[y, x]),
            })
    candidates.sort(key=lambda hit: (-hit["score"], hit["id"], hit["y"], hit["x"]))
    hits = []
    for candidate in candidates:
        if any(
            (candidate["x"] - hit["x"]) ** 2 + (candidate["y"] - hit["y"]) ** 2 < 30 ** 2
            for hit in hits
        ):
            continue
        hits.append(candidate)
    if name in ("tab_weapon", "tab_spirit", "tab_vitality"):
        category_ids = {
            item_id for item_id, item in catalog.items()
            if item["category"] == name[4:]
        }
        missing = category_ids - {hit["id"] for hit in hits}
        for item_id in sorted(missing):
            scores = cv2.matchTemplate(
                region, templates[item_id][10:50, 10:50], cv2.TM_CCOEFF_NORMED
            )
            _, score, _, location = cv2.minMaxLoc(scores)
            # The matched centre begins +10,+10 inside the original icon:
            # subtract that inset to recover its full 60x60 frame.
            x, y = location[0] + 540 - 10, location[1] + top - 10
            if score < 0.75 or any(
                (x - hit["x"]) ** 2 + (y - hit["y"]) ** 2 < 30 ** 2
                for hit in hits
            ):
                continue
            hits.append({
                "id": item_id,
                **rect(x, y, ICON_SIZE, ICON_SIZE),
                "score": float(score),
                "fallback": True,
            })
        missing = category_ids - {hit["id"] for hit in hits}
        if missing:
            raise ValueError(f"{name}: missing catalog cards: {', '.join(sorted(missing))}")
    for hit in hits:
        hit["score"] = round(hit["score"], 6)
    return sorted(hits, key=lambda hit: (hit["y"], hit["x"], hit["id"]))


def measure_tiers(cards, category, catalog):
    tiers = {}
    for tier in range(1, 5):
        hits = [
            hit for hit in cards
            if catalog[hit["id"]]["category"] == category
            and catalog[hit["id"]]["tier"] == tier
        ]
        if not hits:
            raise ValueError(f"{category}: no card hits for tier {tier}")
        x, y = min(hit["x"] for hit in hits), min(hit["y"] for hit in hits)
        right = max(hit["x"] + hit["w"] for hit in hits)
        bottom = max(hit["y"] + hit["h"] for hit in hits)
        first = min(hits, key=lambda hit: (hit["y"], hit["x"], hit["id"]))
        tiers[str(tier)] = {"rect": rect(x, y, right - x, bottom - y), "firstCard": first}
    return tiers


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--captures", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--copy-to", type=Path, required=True)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    cv2.setRNGSeed(0)
    catalog = load_catalog()
    images = {name: read_capture(args.captures / f"{name}.png") for name in CAPTURE_NAMES}
    templates = build_templates(args.captures, catalog, images)
    measured = {}
    for name in sorted(CAPTURE_NAMES):
        path = args.captures / f"{name}.png"
        image = images[name]
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        entry = {
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "size": path.stat().st_size,
            "board": measure_board(image),
            "tabs": measure_tabs(hsv),
            "cards": [] if name.startswith("menu_") else measure_cards(image, name, templates, catalog),
        }
        if name in ("tab_weapon", "tab_spirit", "tab_vitality"):
            entry["tiers"] = measure_tiers(entry["cards"], name[4:], catalog)
        if name.startswith("menu_"):
            entry["menu"] = measure_menu(hsv)
        measured[name] = entry
    # Measure all sources before publishing fixtures, so a bad capture fails
    # without leaving a partially copied reference set.
    args.copy_to.mkdir(parents=True, exist_ok=True)
    for name in sorted(CAPTURE_NAMES):
        source, destination = args.captures / f"{name}.png", args.copy_to / f"{name}.png"
        if source.resolve() != destination.resolve():
            shutil.copyfile(source, destination)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    result = {"clientVersion": 6763, "frame": FRAME, "captures": measured}
    args.out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Measured {len(measured)} captures with {len(templates)} icon templates")
    for name, entry in sorted(measured.items()):
        print(f"{name}: {len(entry['cards'])} cards")


if __name__ == "__main__":
    main()
