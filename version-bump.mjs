import fs from "fs";
import process from "process";

if (process.argv.length < 3) {
  console.error("Usage: node version-bump.mjs <new-version>");
  process.exit(1);
}

const newVersion = process.argv[2];

const update = (file, key) => {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  json[key] = newVersion;
  fs.writeFileSync(file, JSON.stringify(json, null, "\t") + "\n");
  console.log(`Updated ${key} in ${file} to ${newVersion}`);
};

update("manifest.json", "version");
update("package.json", "version");