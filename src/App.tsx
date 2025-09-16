#root {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;

  /* Background gradient inspired by sky → mountain */
  background: linear-gradient(
    180deg,
    hsl(210 80% 97%),
    hsl(210 40% 92%),
    hsl(145 30% 90%)
  );
  border-radius: 1rem;
  box-shadow: 0 4px 20px hsla(210, 20%, 20%, 0.15);
}

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 1.5em hsl(210 80% 55% / 0.7));
}
.logo.react:hover {
  filter: drop-shadow(0 0 1.5em hsl(25 90% 55% / 0.7));
}

@keyframes logo-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: no-preference) {
  a:nth-of-type(2) .logo {
    animation: logo-spin infinite 20s linear;
  }
}

/* Card styling updated to match new theme */
.card {
  padding: 2em;
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
  border-radius: var(--radius);
  box-shadow: 0 2px 12px hsla(210, 20%, 20%, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 6px 18px hsla(210, 30%, 20%, 0.15);
}

.read-the-docs {
  color: hsl(220 10% 40%);
  font-style: italic;
}

/* Hero buttons */
.button-primary {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius);
  font-weight: 600;
  transition: background 0.3s ease;
}
.button-primary:hover {
  background: hsl(210 80% 50%);
}

.button-secondary {
  background: hsl(var(--secondary));
  color: hsl(var(--secondary-foreground));
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius);
  font-weight: 600;
  transition: background 0.3s ease;
}
.button-secondary:hover {
  background: hsl(25 90% 50%);
}
