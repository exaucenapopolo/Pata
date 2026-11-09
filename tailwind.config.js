/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', content: ['./src/**/*.{js,jsx}'],
  theme: { extend: {
    colors: { brand: { 50:'#eff5fb',100:'#dfeaf4',200:'#c3d8e8',300:'#9bbdd5',400:'#6c9abb',500:'#41759e',600:'#24577f',700:'#123e63',800:'#0c3150',900:'#07243c' } },
    fontFamily: { sans: ['Inter','system-ui','-apple-system','BlinkMacSystemFont','Segoe UI','sans-serif'] },
    boxShadow: { 'pata-card':'0 2px 12px rgba(8,39,70,.045)','pata-float':'0 14px 36px rgba(8,39,70,.12)' },
  } }, plugins: [],
};
