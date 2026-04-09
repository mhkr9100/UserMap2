(function () {
  var savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
    if (!savedTheme) localStorage.setItem('theme', 'dark');
  }
})();
