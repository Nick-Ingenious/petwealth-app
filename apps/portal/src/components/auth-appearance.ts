/**
 * Styles Clerk's <SignIn /> and <SignUp /> to match the portal design: flat (no card), large
 * rounded inputs, ink pill button, Google below the form. Classes end in "!" so they win over
 * Clerk's own styles.
 */
export const authAppearance = {
  options: {
    elevation: "flush",
    socialButtonsPlacement: "bottom",
    socialButtonsVariant: "blockButton",
  },
  variables: {
    colorPrimary: "#1b2330",
    colorForeground: "#1b2330",
    fontFamily: "inherit",
    borderRadius: "1rem",
  },
  elements: {
    rootBox: "w-full!",
    cardBox: "w-full! max-w-none! shadow-none! border-0!",
    card: "bg-transparent! p-0! gap-6!",
    header: "hidden!",
    form: "gap-6!",
    formFieldLabel: "text-lg! font-normal! text-ink! after:ml-0.5 after:text-red-500 after:content-['*']",
    formFieldInput: "h-14! max-h-none! rounded-2xl! border! border-zinc-200! bg-white! px-5! text-lg! shadow-none!",
    formButtonPrimary: "h-14! rounded-full! bg-ink! text-lg! font-semibold! normal-case! shadow-none!",
    dividerLine: "bg-zinc-200!",
    dividerText: "text-base! text-zinc-400!",
    socialButtonsBlockButton: "h-14! rounded-full! border! border-zinc-200! bg-white! shadow-none!",
    socialButtonsBlockButtonText: "text-lg! font-medium! text-ink!",
    footer: "bg-transparent! bg-none!",
    footerAction: "justify-center!",
    footerActionText: "text-lg! text-zinc-500!",
    footerActionLink: "text-lg! font-semibold! text-ink! underline! underline-offset-4!",
  },
} as const;

/** Shared Clerk wording: the design labels fields "Email" / "Password". */
export const authLocalization = {
  formFieldLabel__emailAddress: "Email",
  formFieldInputPlaceholder__emailAddress: "you@email.com",
  formFieldLabel__password: "Password",
};
