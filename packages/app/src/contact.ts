/**
 * The author's address, deliberately not written down as one readable string.
 *
 * Address harvesters are mostly regular expressions run over whatever a page
 * serves: they look for `something@something.tld` and for `mailto:` in the
 * markup. So the two halves live here reversed and base64 encoded, they are
 * only put together when a reader asks for them, and no `mailto:` exists in
 * the document until then. A crawler that runs the page's JavaScript and
 * clicks the button will still get it - that is the price of the address
 * being usable at all - but it is no longer free for the taking.
 */
const HALVES = ["MDIwMnNlbWFnc25uaWY=", "bW9jLmxpYW1n"];

export function authorAddress(): string {
  return HALVES.map((half) => atob(half).split("").reverse().join("")).join("@");
}
