import { countryName } from "@/lib/format";
import type { JobFilters, JobsFacets } from "../_data/query";

const WORK_MODES = ["remote", "hybrid", "onsite", "unknown"] as const;
const JOB_TYPES = ["full_time", "part_time", "contract", "temp", "internship"] as const;
const COLLAR_TYPES = ["white", "blue", "grey", "unknown"] as const;

const HUMAN: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Unknown",
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temp: "Temp",
  internship: "Internship",
  white: "White-collar",
  blue: "Blue-collar",
  grey: "Grey-collar",
};

/**
 * Filter sidebar. Uses a plain GET form so filtering works without JS — the
 * page re-renders server-side with the new `searchParams`. The Reset link
 * just navigates to /jobs with no query.
 */
export function JobsFilters({
  filters,
  facets,
}: {
  filters: JobFilters;
  facets: JobsFacets;
}) {
  return (
    <form method="get" className="flex flex-col gap-5 text-sm">
      <FilterField label="Search">
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Title, company, keyword…"
          className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      </FilterField>

      <FilterField label="Country">
        <SelectField name="country" value={filters.country}>
          {facets.countries.map((c) => (
            <option key={c.value} value={c.value}>
              {countryName(c.value)} ({c.count})
            </option>
          ))}
        </SelectField>
      </FilterField>

      <FilterField label="Category">
        <SelectField name="category" value={filters.category}>
          {facets.categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.count})
            </option>
          ))}
        </SelectField>
      </FilterField>

      <FilterField label="Work mode">
        <SelectField name="workMode" value={filters.workMode}>
          {WORK_MODES.map((m) => (
            <option key={m} value={m}>{HUMAN[m]}</option>
          ))}
        </SelectField>
      </FilterField>

      <FilterField label="Job type">
        <SelectField name="jobType" value={filters.jobType}>
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>{HUMAN[t]}</option>
          ))}
        </SelectField>
      </FilterField>

      <FilterField label="Collar">
        <SelectField name="collarType" value={filters.collarType}>
          {COLLAR_TYPES.map((c) => (
            <option key={c} value={c}>{HUMAN[c]}</option>
          ))}
        </SelectField>
      </FilterField>

      <FilterField label="Salary (min)">
        <input
          type="number"
          name="salaryMin"
          min={0}
          step={5000}
          defaultValue={filters.salaryMin ?? ""}
          placeholder="0"
          className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      </FilterField>

      <FilterField label="Salary (max)">
        <input
          type="number"
          name="salaryMax"
          min={0}
          step={5000}
          defaultValue={filters.salaryMax ?? ""}
          placeholder="No limit"
          className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      </FilterField>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90"
        >
          Apply
        </button>
        <a
          href="/jobs"
          className="rounded-md border border-foreground/15 px-3 py-2 text-sm font-medium hover:border-foreground/40"
        >
          Reset
        </a>
      </div>
    </form>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-foreground/60">
        {label}
      </span>
      {children}
    </label>
  );
}

function SelectField({
  name,
  value,
  children,
}: {
  name: string;
  value: string | null;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={value ?? ""}
      className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
    >
      <option value="">Any</option>
      {children}
    </select>
  );
}
