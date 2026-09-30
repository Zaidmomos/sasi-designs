// Store settings — replace these with your real details.
// whatsapp: country code + number, digits only (e.g. "919876543210").
const STORE = {
  name: "Sasi Designs",
  whatsapp: "91XXXXXXXXXX",
  phoneDisplay: "+91 XXXXX XXXXX",
  email: "hello@sasidesigns.in",
  freeShippingAbove: 999,
  shippingFee: 79,
};

// Product catalogue.
// type: "nighty" | "kurta"
// colors: [base, accent] used to draw the garment illustration
// pattern: "buti" | "stripe" | "floral" | "check" | "paisley" | "plain"
const PRODUCTS = [
  {
    id: "n1", type: "nighty", name: "Jaipur Buti Cotton Nighty",
    price: 649, mrp: 899, fabric: "Pure cotton, hand block print",
    colors: ["#f3d9c4", "#b5452f"], pattern: "buti", tag: "Bestseller",
    desc: "Feather-light Jaipuri cotton with tiny hand-stamped butis. Front zip for easy wear, side pockets and a relaxed A-line fall.",
  },
  {
    id: "n2", type: "nighty", name: "Indigo Dabu Maxi Nighty",
    price: 749, mrp: 999, fabric: "Cotton cambric, dabu print",
    colors: ["#2f4a78", "#e9e3d6"], pattern: "floral",
    desc: "Deep indigo dabu print with a soft yoke and half sleeves. Breathable enough for hot nights, pretty enough for mornings.",
  },
  {
    id: "n3", type: "nighty", name: "Mint Stripe Feeding Nighty",
    price: 699, mrp: 949, fabric: "Soft cotton hosiery",
    colors: ["#cfe6da", "#3f7f68"], pattern: "stripe", tag: "Maternity",
    desc: "Discreet dual feeding zips hidden in the pleats. Stretchy, gentle cotton that is kind to new mothers.",
  },
  {
    id: "n4", type: "nighty", name: "Rose Paisley Rayon Nighty",
    price: 599, mrp: 799, fabric: "Rayon, digital print",
    colors: ["#f2c6cf", "#9c3b56"], pattern: "paisley",
    desc: "Fluid rayon that drapes beautifully, with a classic paisley print and lace-trimmed neckline.",
  },
  {
    id: "n5", type: "nighty", name: "Mustard Check Button-Down Nighty",
    price: 679, mrp: 899, fabric: "Cotton flex",
    colors: ["#f0cf7a", "#7a5a12"], pattern: "check",
    desc: "Full front button placket, patch pocket and a cheerful mustard check. A home-day favourite.",
  },
  {
    id: "n6", type: "nighty", name: "Ivory Chikan Lace Nighty",
    price: 849, mrp: 1199, fabric: "Cotton voile with lace",
    colors: ["#f6f0e4", "#b99c6b"], pattern: "plain", tag: "New",
    desc: "Airy ivory voile finished with chikankari-inspired lace at the yoke and hem. Fully lined for comfort.",
  },
  {
    id: "k1", type: "kurta", name: "Kalamkari Straight Kurta",
    price: 1099, mrp: 1499, fabric: "Cotton, Kalamkari print",
    colors: ["#e6c9a0", "#6e2f1f"], pattern: "paisley", tag: "Bestseller",
    desc: "Earthy Kalamkari motifs on a straight-cut cotton kurta with a mandarin collar and three-quarter sleeves.",
  },
  {
    id: "k2", type: "kurta", name: "Teal Chikankari Kurta",
    price: 1399, mrp: 1899, fabric: "Georgette with chikankari",
    colors: ["#2f7a7a", "#eaf2ef"], pattern: "floral", tag: "New",
    desc: "Lucknowi chikankari embroidery on flowing teal georgette. Comes with a matching slip.",
  },
  {
    id: "k3", type: "kurta", name: "Maroon Bandhani A-Line Kurta",
    price: 1199, mrp: 1599, fabric: "Cotton silk, bandhani",
    colors: ["#7c1f2b", "#f3c9a7"], pattern: "buti",
    desc: "Festive maroon bandhani in a flattering A-line cut with gota detailing at the neck.",
  },
  {
    id: "k4", type: "kurta", name: "Sage Pinstripe Office Kurta",
    price: 899, mrp: 1199, fabric: "Cotton linen",
    colors: ["#b9c9a8", "#4c5b3c"], pattern: "stripe",
    desc: "Crisp cotton-linen with fine pinstripes, side slits and pockets. Made for workdays.",
  },
  {
    id: "k5", type: "kurta", name: "Sunflower Anarkali Kurta",
    price: 1499, mrp: 1999, fabric: "Rayon, foil print",
    colors: ["#f2b632", "#8a3d0c"], pattern: "floral",
    desc: "Twirl-worthy anarkali flare in sunshine yellow with delicate foil floral print.",
  },
  {
    id: "k6", type: "kurta", name: "Classic White Cotton Kurta",
    price: 799, mrp: 999, fabric: "Pure cotton",
    colors: ["#fbf8f2", "#8b7b62"], pattern: "plain",
    desc: "The everyday essential: a clean white cotton kurta with pintucks at the yoke. Pairs with everything.",
  },
];

const SIZES = ["S", "M", "L", "XL", "XXL", "3XL", "4XL"];
