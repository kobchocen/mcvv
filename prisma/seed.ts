import { prisma } from "../src/lib/db/client";

/**
 * Prisma seed script for dictionary / lookup tables ("číselníky").
 * Data is taken from docs/sql_pl_data.sql.
 *
 * Run with: pnpm prisma:seed  (or `prisma db seed`)
 * Configured in prisma.config.ts under migrations.seed
 *
 * These tables are small, static reference data → upsert by natural PK.
 */

async function seedWebImageTypes() {
  const data = [
    { id: 1, desc: "news" },
    { id: 2, desc: "profil" },
    { id: 3, desc: "veranda" },
    { id: 4, desc: "pozvánka" },
    { id: 5, desc: "kalendář" },
  ] as const;

  console.log("Seeding WebImageType (cis_typ_webimages)...");

  for (const item of data) {
    await prisma.webImageType.upsert({
      where: { id: item.id },
      update: { desc: item.desc },
      create: { id: item.id, desc: item.desc },
    });
  }
}

async function seedCategories() {
  const data = [
    {
      id: "I",
      name: "ženy nad 60 let",
      age: 60,
      sort: 13,
      sex: "F",
      record: 1569,
      entryFee: 100,
      bibFrom: 721,
      bibTo: 730,
    },
    {
      id: "K",
      name: "žákyně",
      age: 14,
      sort: 8,
      sex: "F",
      record: 1171,
      entryFee: 50,
      bibFrom: 641,
      bibTo: 680,
    },
    {
      id: "A",
      name: "muži",
      age: 0,
      sort: 3,
      sex: "M",
      record: 885,
      entryFee: 100,
      bibFrom: 301,
      bibTo: 380,
    },
    {
      id: "B",
      name: "muži nad 40 let",
      age: 40,
      sort: 4,
      sex: "M",
      record: 1009,
      entryFee: 100,
      bibFrom: 201,
      bibTo: 290,
    },
    {
      id: "C",
      name: "muži nad 50 let",
      age: 50,
      sort: 5,
      sex: "M",
      record: 1072,
      entryFee: 100,
      bibFrom: 131,
      bibTo: 190,
    },
    {
      id: "D",
      name: "muži nad 60 let",
      age: 60,
      sort: 6,
      sex: "M",
      record: 1197,
      entryFee: 100,
      bibFrom: 691,
      bibTo: 710,
    },
    {
      id: "J",
      name: "žáci",
      age: 14,
      sort: 1,
      sex: "M",
      record: 1098,
      entryFee: 50,
      bibFrom: 41,
      bibTo: 90,
    },
    {
      id: "L",
      name: "dorostenci",
      age: 18,
      sort: 2,
      sex: "M",
      record: 964,
      entryFee: 50,
      bibFrom: 861,
      bibTo: 900,
    },
    {
      id: "F",
      name: "ženy",
      age: 0,
      sort: 10,
      sex: "F",
      record: 1048,
      entryFee: 100,
      bibFrom: 901,
      bibTo: 930,
    },
    {
      id: "G",
      name: "ženy nad 40 let",
      age: 40,
      sort: 11,
      sex: "F",
      record: 1091,
      entryFee: 100,
      bibFrom: 771,
      bibTo: 810,
    },
    {
      id: "H",
      name: "ženy nad 50 let",
      age: 50,
      sort: 12,
      sex: "F",
      record: 1220,
      entryFee: 100,
      bibFrom: 741,
      bibTo: 760,
    },
    {
      id: "E",
      name: "muži nad 70 let",
      age: 70,
      sort: 7,
      sex: "M",
      record: 1482,
      entryFee: 100,
      bibFrom: 111,
      bibTo: 120,
    },
    {
      id: "M",
      name: "dorostenky",
      age: 18,
      sort: 9,
      sex: "F",
      record: 1076,
      entryFee: 50,
      bibFrom: 821,
      bibTo: 850,
    },
  ] as const;

  console.log("Seeding Category (cis_mcvv_kateg)...");

  for (const item of data) {
    await prisma.category.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        age: item.age,
        sort: item.sort,
        sex: item.sex,
        record: item.record,
        entryFee: item.entryFee,
        bibFrom: item.bibFrom,
        bibTo: item.bibTo,
      },
      create: { ...item },
    });
  }
}

async function seedPhotoLocations() {
  const data = [
    { id: "R", desc: "před startem", sort: 20 },
    { id: "A", desc: "Atmosféra", sort: 10 },
    { id: "S", desc: "na startu", sort: 30 },
    { id: "T", desc: "na trati", sort: 40 },
    { id: "C", desc: "v cíli", sort: 50 },
    { id: "P", desc: "po závodě", sort: 60 },
    { id: "V", desc: "na stupních vítězů", sort: 70 },
    { id: "N", desc: "nerozpoznáno", sort: 999 },
  ] as const;

  console.log("Seeding PhotoLocation (cis_fotka_kde)...");

  for (const item of data) {
    await prisma.photoLocation.upsert({
      where: { id: item.id },
      update: { desc: item.desc, sort: item.sort },
      create: { ...item },
    });
  }
}

async function seedPhotoAuthors() {
  const data = [
    { id: "U", desc: "Uwe Filter" },
    { id: "J", desc: "Jiří Čech" },
    { id: "O", desc: "Ondřej Pešek" },
    { id: "C", desc: "K.O.B. Choceň" },
    { id: "F", desc: "František Sládek" },
    { id: "T", desc: "Tomáš Křivda" },
    { id: "M", desc: "Martin Křivda" },
    { id: "P", desc: "Pavel Švadlena" },
    { id: "I", desc: "Ivana Švadlenová" },
    { id: "V", desc: "Vojtěch Grundman" },
  ] as const;

  console.log("Seeding PhotoAuthor (cis_fotka_autor)...");

  for (const item of data) {
    await prisma.photoAuthor.upsert({
      where: { id: item.id },
      update: { desc: item.desc },
      create: { ...item },
    });
  }
}

async function main() {
  console.log("🌱 Starting seed of dictionary tables (číselníky)...\n");

  await seedWebImageTypes();
  await seedCategories();
  await seedPhotoLocations();
  await seedPhotoAuthors();

  console.log("\n✅ Seed completed successfully.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
