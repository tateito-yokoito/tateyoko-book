import React from "react";
import { createRoot } from "react-dom/client";
import PostCtaProduction from "./src/PostCtaProduction.jsx";

const MOUNT_ID = "hp-postcta-live-mount";
let mount;
let reactRoot;

function placePostCta() {
  const main = document.getElementById("hp-main");
  const price = document.getElementById("hp-price-live-mount");
  if (!main || !price || price.parentElement !== main) return;

  if (!mount) {
    mount = document.createElement("div");
    mount.id = MOUNT_ID;
    reactRoot = createRoot(mount);
    reactRoot.render(<PostCtaProduction />);
  }
  if (mount.previousElementSibling !== price) price.after(mount);

  // Keep the existing React tree intact so the application routes continue to
  // work. Only superseded homepage sections are hidden from view and focus.
  for (let section = mount.nextElementSibling; section; section = section.nextElementSibling) {
    // The product image dialog is mounted here when opened; it is not a legacy section.
    if (section.matches("dialog.hp-product-zoom")) {
      section.classList.remove("hp-postcta-legacy");
      section.removeAttribute("aria-hidden");
      section.inert = false;
      continue;
    }
    if (!section.classList.contains("hp-postcta-legacy")) {
      section.classList.add("hp-postcta-legacy");
      section.setAttribute("aria-hidden", "true");
      section.inert = true;
    }
  }

  const footerLinks = document.querySelector(".hp-footer > div");
  if (footerLinks && !footerLinks.querySelector("a[href='/life/']")) {
    const link = document.createElement("a");
    link.href = "/life/";
    link.textContent = "縦糸横糸ライフ";
    footerLinks.prepend(link);
  }
}

placePostCta();
new MutationObserver(placePostCta).observe(document.getElementById("root") || document.body, {
  childList: true,
  subtree: true,
});
