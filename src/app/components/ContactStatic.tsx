export function ContactStatic() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-3xl font-display font-bold">Contact</h1>
      <p className="text-slate-700 dark:text-slate-300">
        Have we missed an Australian Warhammer retailer or spotted a price mismatch? Send an email so we can keep the
        comparison tool accurate:
      </p>
      <p>
        <a
          className="font-medium text-blue-600 hover:underline"
          href="mailto:pricehammer25@gmail.com?subject=PriceHammer%20Feedback%20/%20Bug"
        >
          pricehammer25@gmail.com
        </a>
      </p>
    </div>
  );
}
