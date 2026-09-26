// resource:///org/gnome/shell/misc/animationUtils.js, as far as modules/popup.js uses it.

export function ensureActorVisibleInScrollView(scrollView, actor) {
    scrollView.visibleActor = actor;
}
