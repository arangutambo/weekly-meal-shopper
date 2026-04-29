from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "docs" / "gifs"

WIDTH = 1280
HEIGHT = 800
BG = "#f7f2e8"
SURFACE = "#fffdf8"
PANEL = "#f4efe4"
CARD = "#ffffff"
TEXT = "#2b241d"
MUTED = "#7f776d"
ACCENT = "#2f7d62"
ACCENT_LIGHT = "#ddf1e8"
WARM = "#f2dfc2"
WARM_DARK = "#b36b26"
STRIKE = "#9b8e81"
BORDER = "#ddd3c6"


def load_font(size: int, *, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates: list[str]
    if mono:
        candidates = [
            "/System/Library/Fonts/Menlo.ttc",
            "/System/Library/Fonts/Supplemental/Courier New.ttf",
        ]
    elif bold:
        candidates = [
            "/System/Library/Fonts/Supplemental/Avenir Next Demi Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        ]
    else:
        candidates = [
            "/System/Library/Fonts/Supplemental/Avenir Next Regular.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
        ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


FONT_H1 = load_font(34, bold=True)
FONT_H2 = load_font(24, bold=True)
FONT_H3 = load_font(18, bold=True)
FONT_BODY = load_font(20)
FONT_SMALL = load_font(16)
FONT_TINY = load_font(13)
FONT_MONO = load_font(15, mono=True)


@dataclass
class IngredientRow:
    text: str
    highlighted: bool = False
    crossed: bool = False


def ensure_output_dir() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def save_gif(path: Path, frames: Iterable[Image.Image], durations: list[int]) -> None:
    frame_list = [frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=128) for frame in frames]
    frame_list[0].save(
        path,
        save_all=True,
        append_images=frame_list[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )


def wrapped_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, width: int) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    line = words[0]
    for word in words[1:]:
        trial = f"{line} {word}"
        if draw.textlength(trial, font=font) <= width:
            line = trial
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def draw_text_block(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, *, font: ImageFont.ImageFont,
                    fill: str, width: int, line_gap: int = 8) -> int:
    x, y = xy
    lines = wrapped_lines(draw, text, font, width)
    bbox = draw.textbbox((0, 0), "Ag", font=font)
    line_height = bbox[3] - bbox[1]
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_height + line_gap
    return y


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: str, outline: str = BORDER,
            radius: int = 24, width: int = 2) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_window(title: str, subtitle: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    rounded(draw, (34, 26, WIDTH - 34, HEIGHT - 26), SURFACE, outline="#e5dccf", radius=28)
    rounded(draw, (58, 52, WIDTH - 58, HEIGHT - 58), CARD, outline="#efe5d7", radius=24)
    draw.ellipse((80, 72, 94, 86), fill="#ef6b5c")
    draw.ellipse((104, 72, 118, 86), fill="#f1bf47")
    draw.ellipse((128, 72, 142, 86), fill="#68c15d")
    draw.text((164, 67), title, font=FONT_H1, fill=TEXT)
    draw.text((164, 108), subtitle, font=FONT_BODY, fill=MUTED)
    return image, draw


def draw_badge(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, *, fill: str = ACCENT_LIGHT,
               text_fill: str = ACCENT) -> None:
    w = int(draw.textlength(text, font=FONT_SMALL)) + 26
    rounded(draw, (x, y, x + w, y + 34), fill, outline=fill, radius=18, width=1)
    draw.text((x + 13, y + 7), text, font=FONT_SMALL, fill=text_fill)


def draw_pane_shell(draw: ImageDraw.ImageDraw, left_title: str, right_title: str) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int]]:
    left = (84, 170, 520, 718)
    right = (550, 170, 1198, 718)
    rounded(draw, left, PANEL, radius=22)
    rounded(draw, right, PANEL, radius=22)
    draw.text((110, 188), left_title, font=FONT_H2, fill=TEXT)
    draw.text((576, 188), right_title, font=FONT_H2, fill=TEXT)
    return left, right


def draw_ingredient_list(draw: ImageDraw.ImageDraw, pane: tuple[int, int, int, int], rows: list[IngredientRow]) -> None:
    x1, y1, x2, _ = pane
    y = y1 + 52
    for row in rows:
        fill = ACCENT_LIGHT if row.highlighted else CARD
        rounded(draw, (x1 + 24, y, x2 - 24, y + 46), fill, outline="#e7ddcf", radius=16, width=2)
        checkbox = (x1 + 40, y + 13, x1 + 58, y + 31)
        draw.rounded_rectangle(checkbox, radius=4, outline=ACCENT if row.crossed else MUTED, width=2, fill=CARD)
        if row.crossed:
            draw.line((checkbox[0] + 4, checkbox[1] + 9, checkbox[0] + 8, checkbox[1] + 13), fill=ACCENT, width=3)
            draw.line((checkbox[0] + 8, checkbox[1] + 13, checkbox[2] - 3, checkbox[1] + 4), fill=ACCENT, width=3)
        text_x = x1 + 74
        text_y = y + 11
        color = STRIKE if row.crossed else TEXT
        draw.text((text_x, text_y), row.text, font=FONT_SMALL, fill=color)
        if row.crossed:
            line_y = text_y + 11
            width = int(draw.textlength(row.text, font=FONT_SMALL))
            draw.line((text_x, line_y, text_x + width, line_y), fill=STRIKE, width=2)
        y += 58


def draw_steps(draw: ImageDraw.ImageDraw, pane: tuple[int, int, int, int], steps: list[str], active_index: int,
               highlight_terms: list[str] | None = None) -> None:
    x1, y1, x2, _ = pane
    y = y1 + 54
    wrap_width = x2 - x1 - 70
    for idx, step in enumerate(steps):
        active = idx == active_index
        fill = "#eef7f2" if active else CARD
        outline = ACCENT if active else "#e7ddcf"
        rounded(draw, (x1 + 24, y, x2 - 24, y + 104), fill, outline=outline, radius=18, width=3 if active else 2)
        draw.text((x1 + 42, y + 18), f"Step {idx + 1}", font=FONT_H3, fill=ACCENT if active else WARM_DARK)
        step_fill = TEXT
        if highlight_terms:
            for term in highlight_terms:
                step = step.replace(term, term.upper())
        draw_text_block(draw, (x1 + 42, y + 46), step, font=FONT_SMALL, fill=step_fill, width=wrap_width, line_gap=4)
        y += 118


def recipe_view_frames() -> tuple[list[Image.Image], list[int]]:
    steps = [
        "Make the tofu scramble. Cut the tofu into four slabs and press it for 15 minutes.",
        "Whisk turmeric, garlic powder, onion powder, paprika, chipotle flakes, kala namak, tahini, and nutritional yeast with the milk.",
        "Heat olive oil, add tofu, and cook until lightly browned before folding in the sauce.",
    ]
    ingredient_sets = [
        [
            IngredientRow("1 block firm tofu, drained", highlighted=True),
            IngredientRow("0.25 tsp ground turmeric"),
            IngredientRow("0.5 tsp garlic powder"),
            IngredientRow("2 tbsp nutritional yeast"),
            IngredientRow("27.3 g extra-virgin olive oil"),
        ],
        [
            IngredientRow("1 block firm tofu, drained"),
            IngredientRow("0.25 tsp ground turmeric", highlighted=True),
            IngredientRow("0.5 tsp garlic powder", highlighted=True),
            IngredientRow("2 tbsp nutritional yeast", highlighted=True),
            IngredientRow("128.75 g plant-based milk", highlighted=True),
        ],
        [
            IngredientRow("1 block firm tofu, drained", highlighted=True),
            IngredientRow("0.5 tsp kala namak"),
            IngredientRow("2 tbsp nutritional yeast"),
            IngredientRow("128.75 g plant-based milk"),
            IngredientRow("27.3 g extra-virgin olive oil", highlighted=True),
        ],
    ]
    badges = ["Step focus", "Ingredient sync", "Keyboard navigation"]
    frames: list[Image.Image] = []
    for index, rows in enumerate(ingredient_sets):
        image, draw = draw_window(
            "Recipe View",
            "Using Rainbow Plant Life Scrambled Tofu from the vault as the live recipe-view example.",
        )
        for badge_index, badge in enumerate(badges):
            draw_badge(draw, 720 + badge_index * 150, 70, badge)
        left, right = draw_pane_shell(draw, "Ingredients", "Directions")
        draw_ingredient_list(draw, left, rows)
        draw_steps(draw, right, steps, index)
        draw.text((574, 684), "Use j / k or the arrow keys to move between steps.", font=FONT_SMALL, fill=MUTED)
        frames.append(image)
    return frames, [1000, 1100, 1200]


def ingredient_highlighting_frames() -> tuple[list[Image.Image], list[int]]:
    steps = [
        "Whisk turmeric, garlic powder, onion powder, paprika, chipotle flakes, kala namak, tahini, and nutritional yeast with the milk.",
        "Heat olive oil, add tofu, and cook until lightly browned before folding in the sauce.",
        "Finish with more kala namak for extra eggy flavor.",
    ]
    data = [
        (0, ["ground turmeric", "garlic powder", "nutritional yeast", "plant-based milk"]),
        (1, ["block firm tofu", "extra-virgin olive oil"]),
        (2, ["kala namak"]),
    ]
    frames: list[Image.Image] = []
    for active_index, highlighted in data:
        rows = [
            IngredientRow("1 block firm tofu, drained", highlighted="block firm tofu" in highlighted),
            IngredientRow("0.25 tsp ground turmeric", highlighted="ground turmeric" in highlighted),
            IngredientRow("0.5 tsp garlic powder", highlighted="garlic powder" in highlighted),
            IngredientRow("0.5 tsp kala namak", highlighted="kala namak" in highlighted),
            IngredientRow("2 tbsp nutritional yeast", highlighted="nutritional yeast" in highlighted),
            IngredientRow("128.75 g plant-based milk", highlighted="plant-based milk" in highlighted),
            IngredientRow("27.3 g extra-virgin olive oil", highlighted="extra-virgin olive oil" in highlighted),
        ]
        image, draw = draw_window(
            "Ingredient Highlighting",
            "The active direction step highlights the matching ingredients in the left pane.",
        )
        draw_badge(draw, 824, 70, "Step-aware matching")
        left, right = draw_pane_shell(draw, "Ingredients", "Active step")
        draw_ingredient_list(draw, left, rows)
        draw_steps(draw, right, steps, active_index, highlight_terms=highlighted)
        frames.append(image)
    return frames, [950, 950, 1100]


def cross_off_frames() -> tuple[list[Image.Image], list[int]]:
    states = [
        [False, False, False, False, False],
        [True, False, False, False, False],
        [True, True, True, False, False],
        [True, True, True, True, True],
    ]
    frames: list[Image.Image] = []
    for state in states:
        image, draw = draw_window(
            "Click-To-Cross-Off Ingredients",
            "Ingredients stay visible while completed items can be ticked off as you cook.",
        )
        draw_badge(draw, 928, 70, "Cook-along mode")
        left, right = draw_pane_shell(draw, "Ingredients", "Directions")
        rows = [
            IngredientRow("1 block firm tofu, drained", crossed=state[0]),
            IngredientRow("0.25 tsp ground turmeric", crossed=state[1]),
            IngredientRow("0.5 tsp garlic powder", crossed=state[2]),
            IngredientRow("2 tbsp nutritional yeast", crossed=state[3]),
            IngredientRow("27.3 g extra-virgin olive oil", crossed=state[4]),
        ]
        draw_ingredient_list(draw, left, rows)
        draw_steps(
            draw,
            right,
            [
                "Press the tofu, whisk the spice-and-milk sauce, then crumble the tofu into chunks.",
                "Cook the tofu in olive oil until lightly browned and fold in the prepared sauce.",
            ],
            1 if sum(state) >= 3 else 0,
        )
        frames.append(image)
    return frames, [700, 700, 700, 1200]


def draw_grouped_sections(draw: ImageDraw.ImageDraw, left: tuple[int, int, int, int], right: tuple[int, int, int, int],
                          active_section: str) -> None:
    sections = [
        ("Vegan queso", ["1 cup cashews, raw", "128.75 g vegan yogurt", "0.5 cup salsa", "2 tbsp jalapeno brine"]),
        ("Tofu scramble", ["1 block firm tofu", "0.5 tsp garlic powder", "0.25 tsp turmeric", "1 tbsp tahini"]),
        ("Pico de gallo", ["1 serrano pepper", "0.75 cup red onion", "350 g tomatoes", "0.5 cup cilantro"]),
        ("Assembly", ["6 burrito tortillas", "2 avocados, diced", "1 tbsp lime juice", "Hot sauce for serving"]),
    ]
    step_map = {
        "Vegan queso": "Blend the cashews, yogurt, salsa, water, spices, nutritional yeast, and jalapenos until smooth.",
        "Tofu scramble": "Press and crumble the tofu, then whisk the spice mixture and cook everything until coated.",
        "Pico de gallo": "Fold the onion, serrano, tomatoes, cilantro, lime juice, and salt together just before serving.",
        "Assembly": "Fill each tortilla with tofu scramble, queso, pico, avocado, and hot sauce before rolling.",
    }
    y_left = left[1] + 56
    y_right = right[1] + 56
    for name, items in sections:
        active = name == active_section
        fill = ACCENT_LIGHT if active else CARD
        rounded(draw, (left[0] + 22, y_left, left[2] - 22, y_left + (144 if active else 52)), fill, radius=18)
        draw.text((left[0] + 40, y_left + 15), name, font=FONT_H3, fill=ACCENT if active else TEXT)
        if active:
            item_y = y_left + 50
            for item in items:
                draw.text((left[0] + 56, item_y), f"- {item}", font=FONT_SMALL, fill=TEXT)
                item_y += 24
            y_left += 156
        else:
            y_left += 64

        rounded(draw, (right[0] + 22, y_right, right[2] - 22, y_right + (144 if active else 52)), fill, radius=18)
        draw.text((right[0] + 40, y_right + 15), name, font=FONT_H3, fill=ACCENT if active else TEXT)
        if active:
            draw_text_block(draw, (right[0] + 40, y_right + 52), step_map[name], font=FONT_SMALL, fill=TEXT,
                            width=right[2] - right[0] - 84, line_gap=5)
            y_right += 156
        else:
            y_right += 64


def section_sync_frames() -> tuple[list[Image.Image], list[int]]:
    frames: list[Image.Image] = []
    for section in ["Vegan queso", "Tofu scramble", "Pico de gallo", "Assembly"]:
        image, draw = draw_window(
            "Subheading Sync",
            "Matching #### headings keep ingredients and directions aligned in the Breakfast Burrito demo note.",
        )
        draw_badge(draw, 905, 70, "Section-aware navigation")
        left, right = draw_pane_shell(draw, "Ingredients", "Directions")
        draw_grouped_sections(draw, left, right, section)
        frames.append(image)
    return frames, [900, 900, 900, 1100]


def draw_canvas(draw: ImageDraw.ImageDraw, area: tuple[int, int, int, int], highlight_section: str | None = None,
                emphasize_card: bool = False) -> None:
    x1, y1, x2, y2 = area
    rounded(draw, area, PANEL, radius=24)
    sections = [
        ("Default", x1 + 28, "#efe4d0"),
        ("Projects", x1 + 330, "#dfeee7"),
        ("Hosting", x1 + 632, "#f5e2dc"),
    ]
    for name, x, fill in sections:
        active = name == highlight_section
        rounded(draw, (x, y1 + 30, x + 262, y2 - 30), fill if active else CARD, radius=22)
        draw.text((x + 24, y1 + 48), name, font=FONT_H2, fill=ACCENT if active else TEXT)

    cards = [
        ("Scrambled Tofu", sections[0][1] + 24, sections[0][1] == (highlight_section or ""), y1 + 112),
        ("Breakfast Burrito Section Sync Demo", sections[1][1] + 24, True, y1 + 112),
        ("Hosting Chili", sections[2][1] + 24, sections[2][1] == (highlight_section or ""), y1 + 112),
    ]
    for title, x, focus, y in cards:
        card_fill = WARM if emphasize_card and "Breakfast Burrito" in title else CARD
        rounded(draw, (x, y, x + 214, y + 92), card_fill, outline=ACCENT if focus else "#e7ddcf", radius=18, width=3 if focus else 2)
        draw.text((x + 16, y + 16), title, font=FONT_SMALL, fill=TEXT)
        draw.text((x + 16, y + 50), "type: Recipe", font=FONT_TINY, fill=MUTED)


def draw_metadata(draw: ImageDraw.ImageDraw, area: tuple[int, int, int, int]) -> None:
    rounded(draw, area, PANEL, radius=24)
    draw.text((area[0] + 28, area[1] + 24), "Recipe Note Metadata", font=FONT_H2, fill=TEXT)
    rows = [
        ("title", "Breakfast Burrito Section Sync Demo"),
        ("Collection", "Demo"),
        ("MealPrep", "true"),
        ("Day", "Projects"),
        ("Time", "\"\""),
    ]
    y = area[1] + 78
    for key, value in rows:
        rounded(draw, (area[0] + 24, y, area[2] - 24, y + 58), CARD, radius=16)
        draw.text((area[0] + 42, y + 18), key, font=FONT_MONO, fill=MUTED)
        draw.text((area[0] + 210, y + 18), value, font=FONT_SMALL, fill=TEXT)
        y += 70


def canvas_metadata_frames() -> tuple[list[Image.Image], list[int]]:
    frames: list[Image.Image] = []

    image, draw = draw_window(
        "Meal-Prep Canvas",
        "Start with your weekly canvas and drop recipe note cards into the section you want to plan around.",
    )
    draw_badge(draw, 890, 70, "Canvas organization")
    draw_canvas(draw, (84, 174, 1198, 536), highlight_section="Projects", emphasize_card=False)
    frames.append(image)

    image, draw = draw_window(
        "Meal-Prep Canvas",
        "The Breakfast Burrito demo note is placed in the Projects section on the weekly canvas.",
    )
    draw_badge(draw, 890, 70, "Placed card example")
    draw_canvas(draw, (84, 174, 1198, 536), highlight_section="Projects", emphasize_card=True)
    frames.append(image)

    image, draw = draw_window(
        "Canvas + Metadata Example",
        "The same demo note also shows Day: Projects in its frontmatter, so the visual plan and note metadata stay easy to read together.",
    )
    draw_badge(draw, 958, 70, "Vault example")
    draw_canvas(draw, (84, 174, 738, 680), highlight_section="Projects", emphasize_card=True)
    draw_metadata(draw, (772, 174, 1198, 680))
    frames.append(image)

    return frames, [950, 950, 1300]


def build_all() -> None:
    ensure_output_dir()
    jobs = {
        "recipe-view.gif": recipe_view_frames(),
        "ingredient-highlighting.gif": ingredient_highlighting_frames(),
        "ingredient-cross-off.gif": cross_off_frames(),
        "subheading-sync.gif": section_sync_frames(),
        "canvas-to-metadata.gif": canvas_metadata_frames(),
    }
    for filename, (frames, durations) in jobs.items():
        save_gif(OUTPUT_DIR / filename, frames, durations)
        print(f"wrote {OUTPUT_DIR / filename}")


if __name__ == "__main__":
    build_all()
