/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}'
  ],
  safelist: [
    'w-[150px]',
    'w-[340px]'
  ],
  theme: {
    extend: {
      maxWidth: {
        desktop: '90vw'
      }
    }
  },
  plugins: []
};
