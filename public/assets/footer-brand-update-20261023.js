const updateFooterBrand = () => {
  const image = document.querySelector(".landing-site .hp-footer > a > img");
  if (!image) return;
  image.src = "/brand-logo-mark-wordmark.png";
  image.width = 245;
  image.height = 42;
};

if (document.readyState === "complete") {
  updateFooterBrand();
} else {
  window.addEventListener("load", updateFooterBrand, { once: true });
}
