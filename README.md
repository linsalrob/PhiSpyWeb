# PhiSpyWeb

**PhiSpyWeb** is a browser-based prophage prediction tool that runs [PhiSpy](https://github.com/linsalrob/PhiSpy) entirely in your web browser using [Pyodide](https://pyodide.org) and WebAssembly.

No installation required. No data leaves your computer.

---

## What is PhiSpyWeb?

PhiSpyWeb is a static web application that wraps the PhiSpy prophage prediction algorithm and makes it accessible directly from any modern web browser. It loads PhiSpy into a WebAssembly-based Python interpreter (Pyodide), accepts a bacterial genome in GenBank format, runs the full PhiSpy analysis, and displays the predicted prophage regions — all without sending any data to a server.

## Relationship to PhiSpy

PhiSpyWeb is a web front-end for [PhiSpy](https://github.com/linsalrob/PhiSpy), the command-line prophage prediction tool by Rob Edwards and colleagues. PhiSpyWeb uses the same algorithm and package via Pyodide. For citation purposes, please cite the original PhiSpy publications (see below).

## Privacy

> **Your input genome file is not uploaded to a server.**

All computation runs in your browser using a Web Worker and the Pyodide WebAssembly runtime. The genome file you upload is processed entirely on your local machine.

## PhiSpy wheel included in this repository

`public/wheels/phispy-5.0.6-py3-none-any.whl` (~18 MB) is committed directly to this repository.

**Why is the wheel committed here?**

Pyodide's `micropip` can only install packages in the browser if a directly fetchable wheel URL is available — it cannot build from source or install platform-native compiled wheels. PhiSpy is only published on PyPI as a source distribution (sdist) with a C++ extension (`PhiSpyRepeatFinder`), so `micropip.install("phispy")` fails in Pyodide.

To work around this:

1. A pure Python (`py3-none-any`) wheel is built from the PhiSpy 5.0.6 source. The C++ repeat-finder extension is made optional via a stub fallback (returns an empty list when the native extension is absent).
2. The wheel is served as a static asset by PhiSpyWeb itself.
3. `public/wheels/manifest.json` records the version and filename. The worker fetches the manifest, derives the wheel URL, and installs directly from that URL — no package index lookup needed.

**Why does the wheel contain training data (~18 MB)?**

PhiSpy bundles organism-specific training sets used by its random-forest classifier. These are included in the wheel to keep packaging simple. Reducing the wheel size is tracked in a separate issue.

**Updating PhiSpy**

To upgrade PhiSpy in a future release:

1. Build or obtain a new `py3-none-any` wheel for the target version.
2. Add it to `public/wheels/`.
3. Update `public/wheels/manifest.json` with the new version and filename.
4. Redeploy. No TypeScript changes are required.

---


### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install dependencies

```bash
npm install
```

### Start development server

```bash
npm run dev
```

Open [http://localhost:5173/PhiSpyWeb/](http://localhost:5173/PhiSpyWeb/) in your browser.

### Run tests

```bash
npm test
```

### Build for production

```bash
npm run build
```

Output is written to `dist/`.

### Preview production build

```bash
npm run preview
```

---

## Deployment to GitHub Pages

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that:

1. Installs dependencies
2. Builds the Vite app
3. Deploys the `dist/` directory to GitHub Pages

The workflow triggers automatically on pushes to `main`.

### Manual deployment steps

1. Fork or clone this repository.
2. Enable GitHub Pages in your repository settings (source: GitHub Actions).
3. Push to `main`.

The app will be available at `https://<your-username>.github.io/PhiSpyWeb/`.

### Vite base path

`vite.config.ts` sets `base: "/PhiSpyWeb/"` so assets load correctly under the GitHub Pages sub-path. If you deploy to a different path, change this value.

---

## Usage

1. Open the app in a modern browser.
2. Upload a GenBank-format genome file (`.gb`, `.gbk`, `.gbff`).
3. Optionally adjust PhiSpy parameters.
4. Click **Run PhiSpy**.
5. Wait while Pyodide and PhiSpy load (first run only — may take 1–2 minutes).
6. View predicted prophage regions in the table and genome track.
7. Download output files individually or as a `.zip`.

---

## Parameters

| Parameter | Default | Description |
|---|---|---|
| Phage genes threshold | 1 | Minimum phage genes to predict a prophage |
| Window size | 30 | Number of genes in the sliding window |
| Min contig size | 5000 | Minimum contig length in bp |
| Output choice | 512 | Which output files to generate |

---

## Limitations

- **First-run load time**: Pyodide and PhiSpy must be downloaded on the first run (~100–200 MB). Subsequent runs in the same session reuse the cached Python environment.
- **Memory**: Large genomes may exceed available browser memory. For genomes > 50 MB, command-line PhiSpy is recommended.
- **Browser support**: Requires a modern browser with WebAssembly support (Chrome, Edge, Firefox, Safari).
- **Offline use**: After the first run, Pyodide/PhiSpy assets may be cached by the browser, but offline functionality is not guaranteed.
- **Batch analysis**: For processing many genomes, use command-line PhiSpy.

---

## Troubleshooting

**PhiSpy fails to install**
> The worker installs PhiSpy from a self-hosted wheel (`public/wheels/phispy-5.0.6-py3-none-any.whl`) fetched via the manifest at `public/wheels/manifest.json`. If the wheel URL is unreachable, check that the deployment includes the `public/wheels/` directory and that GitHub Pages is serving the files correctly. Check the browser console / status log for the exact HTTP status reported during the wheel URL check.

**Browser runs out of memory**
> Try a smaller genome file or use a desktop browser with more available RAM.

**Page does not load**
> Ensure JavaScript and WebAssembly are enabled in your browser.

**Results seem incorrect**
> PhiSpy in the browser uses the same algorithm as the command-line version. Results should be identical for the same parameters. If you see unexpected results, please file an issue.

---

## Browser Compatibility

| Browser | Support |
|---|---|
| Chrome / Edge | ✅ Full support |
| Firefox | ✅ Full support |
| Safari | ⚠️ Pyodide support may be limited |

WebAssembly and modern JavaScript APIs (SharedArrayBuffer, Web Workers) are required.

---

## Citation

If you use PhiSpyWeb in your research, please cite the original PhiSpy publications:

> Sajia Akhter, Ramy K. Aziz, Robert A. Edwards (2012).
> **PhiSpy: a novel algorithm for finding prophages in bacterial genomes that combines similarity- and composition-based strategies.**
> *Nucleic Acids Research*, 40(16):e126.
> doi: [10.1093/nar/gks406](https://doi.org/10.1093/nar/gks406)

Also see the [PhiSpy repository](https://github.com/linsalrob/PhiSpy) for the most current citation.

---

## Repository Structure

```
PhiSpyWeb/
  README.md
  LICENSE
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  public/
    examples/
      README.md
    wheels/
      manifest.json          # PhiSpy version manifest (single source of version string)
      phispy-5.0.6-py3-none-any.whl  # Self-hosted pure Python wheel (~18 MB)
  src/
    App.tsx
    main.tsx
    styles.css
    workers/
      phispyWorker.ts
    lib/
      phispyTypes.ts
      parsePhiSpyOutputs.ts
      downloadFiles.ts
      genomeTrack.ts
      workerClient.ts
    components/
      FileUpload.tsx
      ParameterPanel.tsx
      RunStatus.tsx
      ResultsSummary.tsx
      ProphageTable.tsx
      GenomeTrack.tsx
      OutputDownloads.tsx
      LogViewer.tsx
    test/
      setup.ts
      parsePhiSpyOutputs.test.ts
      downloadFiles.test.ts
      parameterValidation.test.ts
      genomeTrack.test.ts
  .github/
    workflows/
      deploy.yml
```

---

## License

MIT — see [LICENSE](LICENSE).
