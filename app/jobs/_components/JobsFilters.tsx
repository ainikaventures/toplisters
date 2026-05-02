"use client";

import { useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
 * Client filter sidebar. Selects auto-submit on change; text + number
 * inputs auto-submit on blur. Pressing Enter inside the search box
 * submits too (the wrapping <form>'s default behaviour). The Apply
 * button stays so JS-disabled users still have a working form.
 *
 * `router.replace` (not push) keeps the back button useful — each filter
 * tweak doesn't add a history entry.
 */
export function JobsFilters({
  filters,
  facets,
}: {
  filters: JobFilters;
  facets: JobsFacets;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  // Mobile-only collapse. On lg+ the form is always rendered (CSS forces it).
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = countActive(filters);

  function commit(form: HTMLFormElement) {
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      if (typeof value === "string" && value.trim()) {
        params.set(key, value.trim());
      }
    }
    // Filters changed → reset to page 1.
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commit(event.currentTarget);
  }

  function handleSelectChange() {
    if (formRef.current) commit(formRef.current);
  }

  function handleInputBlur() {
    if (formRef.current) commit(formRef.current);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        className="mb-3 flex w-full items-center justify-between rounded-md border border-foreground/15 px-3 py-2 text-sm font-medium hover:border-foreground/40 lg:hidden"
      >
        <span>
          Filters
          {activeCount > 0 ? (
            <span className="ml-2 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] text-background">
              {activeCount}
            </span>
          ) : null}
        </span>
        <span aria-hidden className="text-xs text-foreground/50">
          {mobileOpen ? "Hide ▲" : "Show ▼"}
        </span>
      </button>

    <form
      ref={formRef}
      method="get"
      action="/jobs"
      onSubmit={handleSubmit}
      className={`${mobileOpen ? "flex" : "hidden"} flex-col gap-5 text-sm lg:flex`}
    >
      <FilterField label="Search">
        <input
          type="search"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Title, company, keyword…"
          onBlur={handleInputBlur}
          className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      </FilterField>

      <FilterField label="Country">
        <SelectField
          name="country"
          value={filters.country}
          onChange={handleSelectChange}
        >
          {facets.countries.map((c) => (
            <option key={c.value} value={c.value}>
              {countryName(c.value)} ({c.count})
            </option>
          ))}
        </SelectField>
      </FilterField>

      <FilterField label="Category">
        <SelectField
          name="category"
          value={filters.category}
          onChange={handleSelectChange}
        >
          {facets.categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.count})
            </option>
          ))}
        </SelectField>
      </FilterField>

      <FilterField label="Work mode">
        <SelectField
          name="workMode"
          value={filters.workMode}
          onChange={handleSelectChange}
        >
          {WORK_MODES.map((m) => (
            <option key={m} value={m}>{HUMAN[m]}</option>
          ))}
        </SelectField>
      </FilterField>

      <FilterField label="Job type">
        <SelectField
          name="jobType"
          value={filters.jobType}
          onChange={handleSelectChange}
        >
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>{HUMAN[t]}</option>
          ))}
        </SelectField>
      </FilterField>

      <FilterField label="Collar">
        <SelectField
          name="collarType"
          value={filters.collarType}
          onChange={handleSelectChange}
        >
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
          onBlur={handleInputBlur}
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
          onBlur={handleInputBlur}
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
    </div>
  );
}

function countActive(filters: JobFilters): number {
  let n = 0;
  for (const [key, value] of Object.entries(filters)) {
    if (key === "page") continue;
    if (value !== null && value !== "") n++;
  }
  return n;
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
  onChange,
  children,
}: {
  name: string;
  value: string | null;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={value ?? ""}
      onChange={onChange}
      className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
    >
      <option value="">Any</option>
      {children}
    </select>
  );
}
