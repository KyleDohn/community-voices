// Skip hook setup in production installs (the Docker runtime stage), where husky isn't installed.
if (process.env.NODE_ENV === 'production' || process.env.CI === 'true') process.exit(0);
const husky = (await import('husky')).default;
console.log(husky());
