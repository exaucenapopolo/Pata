/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f7f2', 100: '#e0eee3', 200: '#c2ddc9', 300: '#98c3a6',
          400: '#5fa47a', 500: '#27845a', 600: '#0b7657', 700: '#075b43',
          800: '#064b38', 900: '#043a2c',
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
