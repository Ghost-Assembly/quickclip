// Gio, as far as the views use it: icons. Nothing here resembles I/O.

export default {
    icon_new_for_string: name => ({ name, isGicon: true }),

    ThemedIcon: class {
        constructor({ name }) {
            this.name = name;
        }
    },

    BytesIcon: class {
        constructor({ bytes }) {
            this.bytes = bytes;
        }
    },
};
