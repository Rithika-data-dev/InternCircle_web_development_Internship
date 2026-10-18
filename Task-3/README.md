# Responsive Product Pricing Cards

A modern SaaS pricing card component.

## Features
- CSS transitions & transform hover effects (lift, scale, shadow, button motion)
- JS toggle switch for Monthly / Yearly billing (animated price change, 20% yearly saving)
- Card badge ribbons: "Popular" and "Best Value"
- Fully responsive (3 columns -> 1 column), keyboard accessible, respects reduced motion

## Run
Open `index.html` in any browser. No build step or dependencies.

## Files
- `index.html` - markup
- `style.css`  - styling, hover effects, ribbons, responsive rules
- `script.js`  - billing toggle logic

## Customize
Edit `data-monthly`, `data-yearly` (per-month price when billed yearly) and `data-total` on each `.card` in `index.html`.
