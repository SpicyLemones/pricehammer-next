export function About() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-3xl font-display font-bold">About</h1>
      <p className="text-slate-700 dark:text-slate-300">
        I built this because I spend a lot of time min-maxxing my expenses on warhammer products, and it was hard (and expensive) to get friends into the hobby. 
      </p>
      <p className="text-slate-700 dark:text-slate-300">Prices vary a lot across stores and names aren’t consistent, so this pulls multiple retailers into one place and links you to the retailers which addresses that complication of maintaining a spreadsheet. </p>
      <p className="text-slate-700 dark:text-slate-300">
        Our coverage focuses on Australia and New Zealand for now while we line up data feeds for other regions.
      </p>
      <p className="text-slate-700 dark:text-slate-300">
        This is a hobby project and not affiliated with Games Workshop. If you find bugs or have suggestions, please reach out
        via email below so we can keep the tool sharp.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-slate-700 dark:text-slate-300">
        <li>Track the lowest AUD price for Warhammer 40,000, Age of Sigmar, and Kill Team kits.</li>
        <li>Filter by faction, category, or game system to plan your next army list or campaign.</li>
        <li>Report inaccurate listings so the community can benefit from clean, trusted pricing data.</li>
      </ul>
    </div>
  );
}
