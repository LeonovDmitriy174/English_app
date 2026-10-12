# Значок Gloss: промпты для генератора изображений

Значок приложения: квадрат без скруглений (iOS скругляет сам), без букв и подписей. Название и цвета взяты из самого приложения:
чернила `#1b2231`, бумага `#f4f5f0`, синий карандаш `#8fa8ff` (слово), зелёный `#6fd3b8` (фразовый глагол), красный `#e0584a` (идиома).

Сейчас в приложении стоит вариант C (открытая книга): картинка лежит в `tools/icon-source.png`, значки в `icons/` сделаны из неё.

## Как поставить готовую картинку

1. Сохраните картинку как `tools/icon-source.png` (квадрат, лучше 1024×1024 и больше).
2. Выполните `pip install pillow` (один раз) и `python tools/make_icons.py`.
3. Закоммитьте папку `icons/` и отправьте в GitHub.
4. На iPhone значок запоминается в момент добавления на «Домой»: сохраните копию данных (Настройки → «Сохранить копию данных»), добавьте приложение заново, загрузите копию и удалите старый значок.

## Вариант A: помеченное слово (основной)

```
A minimal app icon, square 1:1 composition, 1024x1024, full-bleed (no rounded corners, no border, no frame).
Flat editorial illustration with a very subtle paper grain: deep ink-navy background (#1b2231). In the center, a single page of
warm off-white paper (#f4f5f0), slightly tilted by about 4 degrees, with three short lines of abstract text drawn as soft grey bars
(no real letters). The middle line is underlined by one confident hand-drawn pencil stroke in periwinkle blue (#8fa8ff), slightly
wavy, with rounded ends, like a reader marking an unfamiliar word. A very soft, small shadow under the page. The subject fills about
65% of the canvas and is centered, leaving generous margin on all sides. Calm, quiet, bookish, premium. High contrast, still
readable at 60x60 pixels. No text, no letters, no numbers, no logo, no watermark, no phone mockup, no 3D, no glossy gradients,
no glow, no photorealism, no clutter.
```

## Вариант B: три карандаша

```
A minimal app icon, square 1:1, 1024x1024, full-bleed, no border or rounded corners. Flat illustration with a subtle paper grain.
Deep ink-navy background (#1b2231). One off-white notebook page (#f4f5f0), centered, slightly rotated, with three lines of abstract
text drawn as soft grey bars (no real letters). Under each of the three lines there is one hand-drawn pencil underline stroke,
each in a different color: periwinkle blue (#8fa8ff), mint green (#6fd3b8), coral red (#e0584a). The strokes are slightly uneven
and wavy, with rounded ends, like real pencil. Very soft small shadow under the page. The page fills about 65% of the canvas.
Quiet, bookish, elegant. Legible at 60x60 pixels. No text, no letters, no numbers, no logo, no watermark, no phone mockup,
no 3D, no glossy gradients, no glow, no clutter.
```

## Вариант C: открытая книга

```
A minimal app icon, square 1:1, 1024x1024, full-bleed, no border or rounded corners. Flat vector-style illustration with a
subtle paper grain. Deep ink-navy background (#1b2231). An open book seen straight from the front, two pages of warm off-white
paper (#f4f5f0) with a slight curve toward the spine and a thin soft shadow in the gutter. On the right page one line of abstract
text drawn as a grey bar is underlined by a single hand-drawn periwinkle-blue pencil stroke (#8fa8ff); a small coral-red
(#e0584a) bookmark ribbon hangs from the top of the spine. Centered, about 65% of the canvas, generous margins. Calm, premium,
readable at 60x60 pixels. No text, no letters, no numbers, no logo, no watermark, no phone mockup, no 3D, no glossy gradients,
no glow, no photorealism, no clutter.
```

Если генератор рисует буквы или портит черту, добавьте в конец: `Do not render any characters.` и попросите «less detail, flatter».
