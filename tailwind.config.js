/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7',
          400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857',
          800: '#065f46', 900: '#064e3b',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'] },
      boxShadow: {
        'pata-card': '0 2px 12px rgba(7, 91, 67, 0.055)',
        'pata-float': '0 14px 36px rgba(7, 91, 67, 0.14)',
      },
    },
  },
  plugins: [],
};
