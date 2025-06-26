function scale() {
    const wrapper = document.getElementById("content-wrapper");
    if (!wrapper) return;

    const scaleFactor = Math.min(
        window.innerWidth / wrapper.scrollWidth,
        window.innerHeight / wrapper.scrollHeight
    );

    wrapper.style.transform = `scale(${scaleFactor})`;
    wrapper.style.transformOrigin = "top left";

    document.body.style.overflow = "hidden";
}

window.addEventListener("resize", scale);
window.addEventListener("load", scale);
