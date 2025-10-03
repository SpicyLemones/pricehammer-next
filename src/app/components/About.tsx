export function About() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-3xl font-display font-bold">About</h1>
      <p className="text-slate-700 dark:text-slate-300">
        PriceHammer is a hobby-built search tool that helps Warhammer fans compare Games Workshop product prices across local
        retailers. Data is curated and updated regularly so you can see the latest deals before limited stock disappears.
      </p>
      <p>
        Currently data only covers the OCE region, with a curated list of local game stores.
      </p>
      <p className="text-slate-700 dark:text-slate-300">
        This is a hobby project; not affiliated with Games Workshop. If you find bugs or have suggestions,
        please reach out via email below.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-slate-700 dark:text-slate-300">
        <li>Track the lowest AUD price for Warhammer 40,000, Age of Sigmar, and Kill Team kits.</li>
        <li>Filter by faction, category, or game system to plan your next army list or campaign.</li>
        <li>Report inaccurate listings so the community can benefit from clean, trusted pricing data.</li>
      </ul>
    </div>
  );
}
