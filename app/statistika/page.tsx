import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import DistrictMap from "@/components/district-map";

export const metadata: Metadata = {
	title: "Statistika — Doseg",
	description:
		"Ranking zagrebačkih gradskih četvrti po dostupnosti javnim prijevozom u 30 minuta.",
};

export const dynamic = "force-dynamic";

interface DistrictScore {
	name: string;
	osmId: number;
	population?: number;
	sampleCount: number;
	avgReachableCells: number;
	rank: number;
	score: number;
	bestPoint: { lat: number; lon: number };
	tramLines: string[];
	busLines: string[];
	stops: number;
	avgHeadwayMin: number;
}

interface ScoreData {
	generatedAt: string;
	departureTime: string;
	gridSpacingM: number;
	maxMinutes: number;
	totalSamplePoints: number;
	totalGridCells: number;
	districts: DistrictScore[];
}

type DistrictEmblems = Record<string, string>;

function getDataDir(): string {
	return process.env.DATA_DIR || join(process.cwd(), "data");
}

function loadScores(): ScoreData | null {
	const scorePath = join(getDataDir(), "district-scores.json");
	try {
		return JSON.parse(readFileSync(scorePath, "utf-8"));
	} catch {
		return null;
	}
}

function loadDistrictEmblems(): DistrictEmblems {
	try {
		return JSON.parse(
			readFileSync(join(process.cwd(), "public", "district-emblems.json"), "utf-8"),
		) as DistrictEmblems;
	} catch {
		return {};
	}
}

function pct(cells: number, total: number): string {
	const p = (cells / total) * 100;
	if (p < 0.1) return "<0,1";
	if (p < 1) return p.toFixed(1).replace(".", ",");
	return Math.round(p).toString();
}

export default function StatistikaPage() {
	const data = loadScores();

	if (!data) {
		return (
			<Shell>
				<BackLink />
				<h1 className="mt-8 text-2xl font-semibold tracking-tight text-white">
					Povezanost četvrti
				</h1>
				<div className="mt-10 rounded-xl bg-white/4 px-5 py-4 ring-1 ring-white/6">
					<p className="text-[14px] text-slate-400">
						Nije moguće generirati podatke. Provjeri je li OTP pokrenut.
					</p>
					<p className="mt-1 text-[13px] text-slate-600">
						Pokreni{" "}
						<code className="rounded bg-white/6 px-1.5 py-0.5 text-[12px] text-slate-400">
							docker compose up otp
						</code>{" "}
						pa osvježi stranicu.
					</p>
				</div>
			</Shell>
		);
	}

	const districtEmblems = loadDistrictEmblems();

	// Derived insights
	const totalPop = data.districts.reduce((s, d) => s + (d.population ?? 0), 0);
	const poorDistricts = data.districts.filter((d) => d.score < 25);
	const goodDistricts = data.districts.filter((d) => d.score >= 50);
	const poorPop = poorDistricts.reduce((s, d) => s + (d.population ?? 0), 0);
	const goodPop = goodDistricts.reduce((s, d) => s + (d.population ?? 0), 0);
	const best = data.districts[0];
	const worst = data.districts[data.districts.length - 1];
	const bestPct = pct(best.avgReachableCells, data.totalGridCells);
	const worstPct = pct(worst.avgReachableCells, data.totalGridCells);
	const ratio = Math.round(best.avgReachableCells / worst.avgReachableCells);
	const generatedLabel = new Date(data.generatedAt).toLocaleDateString("hr-HR", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});

	// Weighted city average
	const weightedSum = data.districts.reduce(
		(s, d) => s + d.avgReachableCells * d.sampleCount,
		0,
	);
	const cityAvg = weightedSum / data.totalSamplePoints;

	// Group by quality band
	const bands = [
		{
			label: "Odlična povezanost",
			color: "#16a34a",
			districts: data.districts.filter((d) => d.score >= 70),
		},
		{
			label: "Dobra povezanost",
			color: "#0891b2",
			districts: data.districts.filter((d) => d.score >= 50 && d.score < 70),
		},
		{
			label: "Slaba povezanost",
			color: "#2563eb",
			districts: data.districts.filter((d) => d.score >= 25 && d.score < 50),
		},
		{
			label: "Loša povezanost",
			color: "#9333ea",
			districts: data.districts.filter((d) => d.score < 25),
		},
	].filter((b) => b.districts.length > 0);

	return (
		<Shell>
			<BackLink />
			<StatHero
				best={best}
				bestPct={bestPct}
				departureTime={data.departureTime}
				generatedLabel={generatedLabel}
				maxMinutes={data.maxMinutes}
				ratio={ratio}
				worst={worst}
			/>

			{/* Choropleth map */}
			<section className="mt-20 sm:mt-32">
				<div className="mb-10 text-center flex flex-col items-center">
					<h2 className="text-3xl sm:text-4xl font-serif tracking-tight text-slate-900 dark:text-slate-100">
						Karta područja
					</h2>
					<p className="mt-4 flex items-center justify-center gap-2 text-[13px] text-slate-600 dark:text-slate-400">
						<span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-emerald-500" />
						Zeleno = bolja povezanost, ljubičasto = lošija. Zadrži pokazivač ili fokusiraj četvrt.
					</p>
				</div>
				<div className="mx-auto max-w-5xl">
					<DistrictMap />
				</div>
			</section>

			{/* Headline insights */}
			<div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 border-t border-black/10 dark:border-white/10 pt-10">
				<div className="flex flex-col">
					<div className="flex items-baseline gap-1.5">
						<span className="text-[36px] text-slate-900 dark:text-slate-100 font-serif tabular-nums leading-none">
							{goodDistricts.length}
						</span>
						<span className="text-[13px] text-slate-500 dark:text-slate-400">
							od {data.districts.length}
						</span>
					</div>
					<div className="mt-3 text-[11px] font-sans uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
						Četvrti s dobrom povezanošću (≥50)
					</div>
				</div>

				<div className="flex flex-col">
					<div className="flex items-baseline gap-1.5">
						<span className="text-[36px] text-slate-900 dark:text-slate-100 font-serif tabular-nums leading-none">
							{Math.round((poorPop / totalPop) * 100)}%
						</span>
					</div>
					<div className="mt-3 text-[11px] font-sans uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
						Stanovnika živi u slabo povezanim četvrtima
					</div>
				</div>

				<div className="flex flex-col">
					<div className="flex items-baseline gap-1.5">
						<span className="text-[36px] text-slate-900 dark:text-slate-100 font-serif tabular-nums leading-none">
							{bestPct}%
						</span>
					</div>
					<div className="mt-3 text-[11px] font-sans uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
						Grada dostupno iz najboljih četvrti
					</div>
				</div>

				<div className="flex flex-col">
					<div className="flex items-baseline gap-1.5">
						<span className="text-[36px] text-slate-900 dark:text-slate-100 font-serif tabular-nums leading-none">
							{ratio}×
						</span>
					</div>
					<div className="mt-3 text-[11px] font-sans uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
						Razlika između najbolje i najgore četvrti
					</div>
				</div>
			</div>

			<div className="mt-16 sm:mt-24 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
				<div className="lg:col-span-8 space-y-12 lg:space-y-16">
					{/* What the score means */}
					<section>
						<h2 className="text-[22px] text-slate-900 dark:text-slate-100 font-serif border-b border-black/10 dark:border-white/10 pb-4 mb-6">
							Što znači rezultat
						</h2>
						<div className="text-[16px] leading-relaxed text-slate-700 dark:text-slate-400 space-y-4">
							<p>
								Grad je podijeljen u ćelije od ~200m. Rezultat mjeri koliki udio
								tih ćelija ({data.totalGridCells.toLocaleString("hr-HR")}{" "}
								ukupno) možeš doseći za{" "}
								<strong className="text-slate-900 dark:text-slate-200 font-medium">
									{data.maxMinutes} minuta
								</strong>{" "}
								koristeći tramvaj, bus i hodanje. Uzorkovane su samo naseljene
								točke (blizu zgrada u OpenStreetMapu).
							</p>
							<p>
								<strong className="text-slate-900 dark:text-slate-200 font-medium">
									{best.name}
								</strong>{" "}
								ima rezultat 100 — njeni stanovnici prosječno mogu doseći{" "}
								{bestPct}% grada.{" "}
								<strong className="text-slate-900 dark:text-slate-200 font-medium">
									{worst.name}
								</strong>{" "}
								ima rezultat {worst.score} — samo {worstPct}%.
							</p>
						</div>
					</section>

					{/* Accessibility gap */}
					<section>
						<h2 className="text-[22px] text-slate-900 dark:text-slate-100 font-serif border-b border-black/10 dark:border-white/10 pb-4 mb-6">
							Jaz u dostupnosti
						</h2>
						<p className="text-[16px] leading-relaxed text-slate-700 dark:text-slate-400">
							Samo{" "}
							<strong className="text-slate-900 dark:text-slate-200 font-medium">
								{Math.round((goodPop / totalPop) * 100)}%
							</strong>{" "}
							Zagrepčana ({goodPop.toLocaleString("hr-HR")} stan.) živi u
							četvrtima s rezultatom ≥50. Istovremeno,{" "}
							<strong className="text-slate-900 dark:text-slate-200 font-medium">
								{Math.round((poorPop / totalPop) * 100)}%
							</strong>{" "}
							({poorPop.toLocaleString("hr-HR")} stan.) živi u četvrtima gdje je
							rezultat ispod 25 — to uključuje{" "}
							<span className="text-slate-600 dark:text-slate-500">
								{poorDistricts.map((d) => d.name).join(", ")}
							</span>
							.
						</p>
					</section>
				</div>

				<div className="lg:col-span-4 space-y-12 lg:space-y-16">
					{/* Legend */}
					<section>
						<h2 className="text-[12px] font-sans uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-6 pb-4 border-b border-black/10 dark:border-white/10">
							Razredi ocjena
						</h2>
						<div className="flex flex-col gap-4 text-[15px] text-slate-700 dark:text-slate-300 font-medium">
							{[
								{ color: "#16a34a", label: "70–100 Odlično" },
								{ color: "#0891b2", label: "50–69 Dobro" },
								{ color: "#2563eb", label: "25–49 Slabo" },
								{ color: "#9333ea", label: "0–24 Loše" },
							].map(({ color, label }) => (
								<div key={label} className="flex items-center gap-4">
									<span
										className="inline-block h-4 w-4 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]"
										style={{ backgroundColor: color }}
									/>
									{label}
								</div>
							))}
						</div>
					</section>

					{/* Transit network summary */}
					<section>
						<h2 className="text-[12px] font-sans uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-6 pb-4 border-b border-black/10 dark:border-white/10">
							Mreža u brojkama
						</h2>
						<div className="flex flex-col gap-8">
							<div>
								<span className="text-[32px] text-slate-900 dark:text-slate-200 font-serif block tabular-nums leading-none">
									{(() => {
										const allTram = new Set(
											data.districts.flatMap((d) => d.tramLines),
										);
										return allTram.size;
									})()}
								</span>
								<span className="text-[13px] text-slate-500 dark:text-slate-400 mt-2 block">
									Tramvajskih linija
								</span>
							</div>
							<div>
								<span className="text-[32px] text-slate-900 dark:text-slate-200 font-serif block tabular-nums leading-none">
									{(() => {
										const allBus = new Set(
											data.districts.flatMap((d) => d.busLines),
										);
										return allBus.size;
									})()}
								</span>
								<span className="text-[13px] text-slate-500 dark:text-slate-400 mt-2 block">
									Autobusnih linija
								</span>
							</div>
							<div>
								<span className="text-[32px] text-slate-900 dark:text-slate-200 font-serif block tabular-nums leading-none">
									{data.districts
										.reduce((s, d) => s + d.stops, 0)
										.toLocaleString("hr-HR")}
								</span>
								<span className="text-[13px] text-slate-500 dark:text-slate-400 mt-2 block">
									Stajališta ukupno
								</span>
							</div>
						</div>
					</section>
				</div>
			</div>

			{/* District ranking by band */}
			<div className="mt-20 space-y-20 lg:space-y-24">
				{bands.map((band) => (
					<section key={band.label}>
						<div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-black/10 dark:border-white/10 pb-4">
							<div className="flex items-center gap-4">
								<span
									className="inline-block h-4 w-4 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)]"
									style={{ backgroundColor: band.color }}
								/>
								<h3 className="text-3xl font-serif text-slate-900 dark:text-slate-100 tracking-tight">
									{band.label}
								</h3>
							</div>
							<span className="text-[14px] font-medium text-slate-500 dark:text-slate-400">
								{band.districts.length}{" "}
								{band.districts.length === 1 ? "četvrt" : "četvrti"}
							</span>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-12 divide-y sm:divide-y-0 divide-black/5 dark:divide-white/5">
							{band.districts.map((d) => (
								<DistrictCard
									key={d.osmId}
									district={d}
									emblemPath={districtEmblems[String(d.osmId)]}
									totalGridCells={data.totalGridCells}
									bandColor={band.color}
									cityAvg={cityAvg}
									mapLink={`/?lat=${d.bestPoint.lat}&lon=${d.bestPoint.lon}&time=${data.departureTime}`}
									index={d.rank - 1}
								/>
							))}
						</div>
					</section>
				))}
			</div>

			{/* Methodology */}
			<section className="mt-16 pt-8 border-t border-black/10 dark:border-white/10">
				<h2 className="text-[22px] text-slate-900 dark:text-slate-100 font-serif mb-6">
					Metodologija
				</h2>
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
					<div>
						<span className="text-[12px] font-sans uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-2">
							Algoritam
						</span>
						<p className="text-[14px] text-slate-900 dark:text-slate-200">
							Dijkstrina pretraga nad ZET GTFS + pješačkom mrežom
						</p>
					</div>
					<div>
						<span className="text-[12px] font-sans uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-2">
							Raster
						</span>
						<p className="text-[14px] text-slate-900 dark:text-slate-200">
							{data.gridSpacingM}m ·{" "}
							{data.totalSamplePoints.toLocaleString("hr-HR")} uzoraka u
							naseljenim područjima
						</p>
					</div>
					<div>
						<span className="text-[12px] font-sans uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-2">
							Metrika
						</span>
						<p className="text-[14px] text-slate-900 dark:text-slate-200">
							Udio dosežnih ćelija (~200m) od{" "}
							{data.totalGridCells.toLocaleString("hr-HR")} ukupno
						</p>
					</div>
					<div>
						<span className="text-[12px] font-sans uppercase tracking-widest text-slate-500 dark:text-slate-400 block mb-2">
							Vozni red
						</span>
						<p className="text-[14px] text-slate-900 dark:text-slate-200">
							Jutarnji vršni sat (radni dan, {data.departureTime}), bez
							kašnjenja u stvarnom vremenu
						</p>
					</div>
				</div>
			</section>

			<p className="mt-8 text-[12px] text-slate-500 font-serif">
				Zadnji izračun: {generatedLabel}
			</p>
		</Shell>
	);
}

// --- Components ---

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-svh bg-[#F6F5F2] dark:bg-background">
			<main
				id="main-content"
				className="mx-auto max-w-[1400px] px-6 py-12 sm:py-20"
			>
				{children}
			</main>
		</div>
	);
}

function StatHero({
	best,
	bestPct,
	departureTime,
	generatedLabel,
	maxMinutes,
	ratio,
	worst,
}: {
	best: DistrictScore;
	bestPct: string;
	departureTime: string;
	generatedLabel: string;
	maxMinutes: number;
	ratio: number;
	worst: DistrictScore;
}) {
	return (
		<section className="mt-8 sm:mt-12">
			<div className="flex flex-col lg:flex-row lg:items-end gap-10 lg:gap-16">
				<div className="flex-1">
					<div className="inline-flex flex-wrap items-center gap-2 px-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
						<span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
						Zagreb
						<span className="opacity-40">•</span>
						{maxMinutes} min dosega
						<span className="opacity-40">•</span>
						Polazak u {departureTime}
					</div>
					<h1 className="mt-4 max-w-4xl text-5xl font-serif tracking-tight text-slate-900 dark:text-slate-50 sm:text-6xl lg:text-[5.5rem] lg:leading-[0.95]">
						Povezanost četvrti
					</h1>
					<p className="mt-6 max-w-3xl text-[17px] leading-relaxed text-slate-600 dark:text-slate-400 sm:text-[18px]">
						Koliki dio grada prosječni stanovnik svake četvrti može doseći za{" "}
						<strong className="font-medium text-slate-900 dark:text-slate-100">
							{maxMinutes} minuta
						</strong>{" "}
						javnim prijevozom i hodanjem. U jednom jutarnjem vršnom satu vidi se
						vrlo jasan urbani jaz između središta i rubova grada.
					</p>
					<div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
						<HeroStat
							color="#16a34a"
							label="Najbolji doseg"
							value={`${best.name} · ${bestPct}% grada`}
						/>
						<HeroStat
							color="#0891b2"
							label="Zadnji izračun"
							value={generatedLabel}
						/>
						<HeroStat
							color="#f59e0b"
							label="Raspon rezultata"
							value={`${ratio}× između vrha i dna`}
						/>
					</div>
				</div>

				<div className="shrink-0 lg:w-[320px] flex flex-col gap-4">
					<div className="text-[10px] font-sans uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400 px-1">
						Jutarnji presjek
					</div>
					<div className="flex flex-col gap-3">
						<HeroDistrictSummary
							accent="#16a34a"
							district={best}
							label="Najbolja četvrt"
						/>
						<HeroDistrictSummary
							accent="#9333ea"
							district={worst}
							label="Najslabija četvrt"
						/>
					</div>
					<div className="mt-2 grid grid-cols-4 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
						{[
							{ color: "#16a34a", label: "70+" },
							{ color: "#0891b2", label: "50+" },
							{ color: "#2563eb", label: "25+" },
							{ color: "#9333ea", label: "<25" },
						].map((band) => (
							<div
								key={band.label}
								className="flex flex-col items-center gap-2 border-r border-black/10 px-1 py-2.5 text-center last:border-r-0 dark:border-white/10"
							>
								<span
									className="h-2 w-6 rounded-full"
									style={{ backgroundColor: band.color }}
								/>
								<span className="text-[10px] font-sans uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
									{band.label}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}

function HeroStat({
	color,
	label,
	value,
}: {
	color: string;
	label: string;
	value: string;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-[10px] font-sans uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
				<span
					className="h-1.5 w-1.5 rounded-full"
					style={{ backgroundColor: color }}
				/>
				{label}
			</span>
			<span className="text-[15px] font-medium text-slate-800 dark:text-slate-200">
				{value}
			</span>
		</div>
	);
}

function HeroDistrictSummary({
	accent,
	district,
	label,
}: {
	accent: string;
	district: DistrictScore;
	label: string;
}) {
	return (
		<div className="flex items-center justify-between gap-4 py-1">
			<div className="min-w-0">
				<div className="text-[10px] font-sans uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
					{label}
				</div>
				<div className="mt-1 truncate text-[22px] font-serif leading-none text-slate-900 dark:text-slate-100">
					{district.name}
				</div>
			</div>
			<div className="shrink-0 text-right">
				<div className="text-[9px] font-sans uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
					Rezultat
				</div>
				<div
					className="mt-0.5 text-[24px] font-serif leading-none"
					style={{ color: accent }}
				>
					{district.score}
				</div>
			</div>
		</div>
	);
}

function BackLink() {
	return (
		<Link
			href="/"
			className="inline-flex items-center gap-2 text-[13px] font-medium tracking-wide text-slate-600 dark:text-slate-500 transition-colors hover:text-slate-900 dark:hover:text-slate-300 active:scale-[0.97]"
		>
			<svg
				aria-hidden="true"
				width="16"
				height="16"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M10 12L6 8l4-4" />
			</svg>
			Natrag na kartu
		</Link>
	);
}

function DistrictEmblem({
	pathData,
	rank,
	color,
}: {
	pathData?: string;
	rank: number;
	color: string;
}) {
	return (
		<div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
			{pathData ? (
				<>
					<div
						className="absolute inset-[11px] rounded-full blur-[10px]"
						style={{ backgroundColor: `${color}18` }}
					/>
					<svg
						width="56"
						height="56"
						viewBox="0 0 56 56"
						className="absolute inset-0 overflow-visible"
						aria-hidden="true"
					>
						<path
							d={pathData}
							fill={`${color}14`}
							fillRule="evenodd"
							stroke={color}
							strokeWidth="1.35"
							strokeLinejoin="round"
						/>
					</svg>
				</>
			) : (
				<div
					className="absolute inset-0 rounded-2xl border"
					style={{
						borderColor: color,
						backgroundColor: `${color}1a`,
					}}
				/>
			)}
			<span className="relative z-10 inline-flex min-w-7 items-center justify-center px-2 py-1 text-[15px] font-serif tabular-nums text-slate-900 dark:text-white">
				{rank}
			</span>
		</div>
	);
}

function DistrictCard({
	district: d,
	emblemPath,
	totalGridCells,
	bandColor,
	cityAvg,
	mapLink,
	index,
}: {
	district: DistrictScore;
	emblemPath?: string;
	totalGridCells: number;
	bandColor: string;
	cityAvg: number;
	mapLink: string;
	index: number;
}) {
	const reachPct = pct(d.avgReachableCells, totalGridCells);
	const vsAvg = Math.round(((d.avgReachableCells - cityAvg) / cityAvg) * 100);
	const vsAvgStr =
		vsAvg > 0 ? `+${vsAvg}%` : vsAvg === 0 ? "prosjek" : `${vsAvg}%`;
	const hasTram = d.tramLines.length > 0;

	return (
		<div
			className="district-row flex flex-col pt-6"
			style={{ animationDelay: `${index * 40}ms` }}
		>
			<div className="flex items-start gap-4">
				<DistrictEmblem pathData={emblemPath} rank={d.rank} color={bandColor} />
				<div className="flex-1 pt-1.5">
					<h4 className="text-[20px] font-serif text-slate-900 dark:text-slate-100 tracking-tight leading-none">
						{d.name}
					</h4>
					<div className="mt-2.5">
						<span className="text-[10px] font-sans tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400">
							Rank {d.rank}
						</span>
					</div>
				</div>
				<div className="shrink-0 pt-0.5 text-right">
					<div className="text-[9px] font-sans uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500 mb-1.5">
						Rezultat
					</div>
					<span
						className="text-[32px] font-serif tabular-nums leading-none block"
						style={{ color: bandColor }}
					>
						{d.score}
					</span>
				</div>
			</div>

			<div className="mt-6 grid grid-cols-2 gap-y-5 gap-x-4">
				<div>
					<span className="block text-[10px] font-sans uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">
						Doseg grada
					</span>
					<span className="text-[15px] font-serif text-slate-900 dark:text-slate-200">
						{reachPct}%
					</span>
				</div>
				<div>
					<span className="block text-[10px] font-sans uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">
						Od prosjeka
					</span>
					<span
						className={`text-[15px] font-serif ${vsAvg > 0 ? "text-emerald-600 dark:text-emerald-500" : vsAvg < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-400"}`}
					>
						{vsAvgStr}
					</span>
				</div>
				<div>
					<span className="block text-[10px] font-sans uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">
						Stanovnika
					</span>
					<span className="text-[15px] font-serif text-slate-900 dark:text-slate-200">
						{d.population ? d.population.toLocaleString("hr-HR") : "N/A"}
					</span>
				</div>
				<div>
					<span className="block text-[10px] font-sans uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 mb-1">
						Stajališta
					</span>
					<span className="text-[15px] font-serif text-slate-900 dark:text-slate-200">
						{d.stops}
					</span>
				</div>
			</div>

			<div className="mt-6 flex-1 flex flex-col justify-end">
				<div className="flex flex-wrap items-center gap-1.5">
					{hasTram ? (
						<>
							{d.tramLines.map((line) => (
								<span
									key={`t${line}`}
									className="inline-flex h-[22px] min-w-[22px] items-center justify-center border border-black/10 dark:border-white/10 px-1.5 text-[11px] font-medium tabular-nums text-slate-700 dark:text-slate-300 rounded-[3px]"
								>
									{line}
								</span>
							))}
							{d.busLines.length > 0 && (
								<span className="ml-1 text-[12px] text-slate-500 font-serif">
									+ {d.busLines.length} bus
								</span>
							)}
						</>
					) : (
						<span className="border border-black/10 dark:border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 rounded-[3px]">
							Samo bus · {d.busLines.length} linija
						</span>
					)}
				</div>
			</div>

			<div className="mt-6 pt-4 border-t border-black/5 dark:border-white/10 flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<span
						className="w-2.5 h-2.5 rounded-sm"
						style={{ backgroundColor: bandColor }}
					/>
					<span className="text-[10px] font-sans uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
						Ocjena
					</span>
				</div>
				<Link
					href={mapLink}
					className="group/link inline-flex items-center gap-1.5 text-[10px] font-sans uppercase tracking-[0.18em] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
				>
					Karta
					<span
						aria-hidden="true"
						className="inline-block transition-transform duration-150 group-hover/link:translate-x-1"
					>
						&rarr;
					</span>
				</Link>
			</div>
		</div>
	);
}
