// resource:///org/gnome/shell/ui/modalDialog.js, as far as modules/popup.js uses it.
//
// open() fails when canOpen is false, as the real one does when pushModal is
// refused. close() destroys the dialog when destroyOnClose is set.

import { FakeActor } from '../support/actors.js';

export const dialogState = { canOpen: true };

export class ModalDialog extends FakeActor {
    _init({ styleClass = '', destroyOnClose = true } = {}) {
        super._init();
        this.styleClass = styleClass;
        this.destroyOnClose = destroyOnClose;
        this.contentLayout = new FakeActor();
        this.add_child(this.contentLayout);
        this.isOpen = false;
        this.initialKeyFocus = null;
    }

    setInitialKeyFocus(actor) {
        this.initialKeyFocus = actor;
    }

    open() {
        if (!dialogState.canOpen) return false;
        this.isOpen = true;
        this.emit('opened');
        return true;
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.emit('closed');
        if (this.destroyOnClose) this.destroy();
    }
}
