import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          foreground: "hsl(var(--gold-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        glass: {
          DEFAULT: "rgb(255 255 255 / 0.05)",
          border: "rgb(255 255 255 / 0.1)",
        },
        cd: {
          primary:     '#534AB7',
          'primary-50':  '#EEEDFE',
          'primary-800': '#3C3489',
          coral:       '#D85A30',
          'coral-bg':  '#FAECE7',
          'coral-icon':'#993C1D',
          teal:        '#1D9E75',
          'teal-bg':   '#E1F5EE',
          'teal-icon': '#0F6E56',
          'purple-bg': '#EEEDFE',
          'purple-icon':'#3C3489',
          neutral:     '#2C2C2A',
          star:        '#EF9F27',
          'tip-bg':    '#FAEEDA',
          'tip-fg':    '#633806',
        },
        // Editorial redesign palette (additive — see globals.css for the
        // CSS variables). Namespaced names where they would clash with the
        // existing tokens: `ink-muted` (vs `--muted` HSL), `terracotta`
        // (vs `accent` HSL), so PDP/checkout keep their colors untouched.
        paper: {
          DEFAULT: 'var(--paper)',
          2: 'var(--paper-2)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          2: 'var(--ink-2)',
          muted: 'var(--ink-muted)',
        },
        subtle: 'var(--subtle)',
        hairline: {
          DEFAULT: 'var(--hairline)',
          2: 'var(--hairline-2)',
        },
        terracotta: {
          DEFAULT: 'var(--terracotta)',
          ink: 'var(--terracotta-ink)',
          bg: 'var(--terracotta-bg)',
        },
        sage: {
          DEFAULT: 'var(--sage)',
          bg: 'var(--sage-bg)',
        },
      },
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-mesh': 'var(--gradient-mesh)',
      },
      boxShadow: {
        'glass': 'var(--shadow-glass)',
        'glass-hover': 'var(--shadow-glass-hover)',
        'glow': 'var(--shadow-glow)',
      },
      fontFamily: {
        // Existing defaults — keep so PDP / checkout (frozen) compile
        // unchanged; the Beauty redesign relies on `font-serif` =
        // Cormorant for its title.
        serif: ['Cormorant Garamond', 'serif'],
        sans: ['Inter', 'sans-serif'],
        // Editorial redesign font stack. Pages opt in via
        // `font-editorial-{serif,sans,mono}` (or the `pv-*` utility
        // classes in globals.css).
        'editorial-serif': ['var(--f-serif)', 'Georgia', 'serif'],
        'editorial-sans': ['var(--f-sans)', 'system-ui', 'sans-serif'],
        'editorial-mono': ['var(--f-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-up": {
          from: { transform: "translateY(20px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-up": "slide-in-up 0.4s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
