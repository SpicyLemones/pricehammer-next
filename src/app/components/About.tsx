export function About() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-3xl font-display font-bold">About</h1>
      <p className="text-slate-700 dark:text-slate-300">
        I built PriceHammer because I spend far too much time min-maxing my
        Warhammer spending, and getting friends into the hobby was expensive
        enough already.
      </p>
      <p className="text-slate-700 dark:text-slate-300">
        Prices vary a lot between stores and product names are rarely
        consistent, so keeping a spreadsheet up to date was a losing battle.
        This site pulls Australian retailers into one place and links you
        straight to the store.
      </p>
      <p className="text-slate-700 dark:text-slate-300">
        It&apos;s a hobby project and not affiliated with Games Workshop.
      </p>

      <h2 className="text-2xl font-display font-semibold pt-4">Get in touch</h2>
      <p className="text-slate-700 dark:text-slate-300">
        Spotted a wrong price, a broken link, or a store worth adding? Send me
        an email:
      </p>
      <p>
        <a
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          href="mailto:pricehammer25@gmail.com?subject=PriceHammer%20Feedback%20/%20Bug"
        >
          pricehammer25@gmail.com
        </a>
      </p>
    </div>
  );
}
