# PhiSpyWeb

**PhiSpyWeb** is a browser-based prophage prediction tool that runs [PhiSpy](https://github.com/linsalrob/PhiSpy) entirely in your web browser using [Pyodide](https://pyodide.org) and WebAssembly.

No installation required. No data leaves your computer.

[Try PhiSpyWeb Here](https://linsalrob.github.io/PhiSpyWeb/)

---

## What is PhiSpyWeb?

PhiSpyWeb is a static web application that wraps the PhiSpy prophage prediction algorithm and makes it accessible directly from any modern web browser. It loads PhiSpy into a WebAssembly-based Python interpreter (Pyodide), accepts a bacterial genome in GenBank format, runs the full PhiSpy analysis, and displays the predicted prophage regions — all without sending any data to a server.

PhiSpyWeb is a web front-end for [PhiSpy](https://github.com/linsalrob/PhiSpy), the command-line prophage prediction tool by Rob Edwards and colleagues. PhiSpyWeb uses the same algorithm and package via Pyodide. For citation purposes, please cite the original PhiSpy publications (see below).

The command line version has a few additional options that are not available in the web version. For example, the command line version can use an HMM search against a phage protein database (e.g. VOG or PHROGs) to improve the results.

## Privacy

> **Your input genome file is not uploaded to a server.**

All computation runs in your browser using a Web Worker and the Pyodide WebAssembly runtime. The genome file you upload is processed entirely on your local machine.


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
- **Memory**: Large genomes may exceed available browser memory. For genomes > 50 MB, command-line PhiSpy is recommended, but you shouldn't have a bacterial genome that big!
- **Browser support**: Requires a modern browser with WebAssembly support (Chrome, Edge, Firefox, Safari).
- **Offline use**: After the first run, Pyodide/PhiSpy assets may be cached by the browser, but offline functionality is not guaranteed.
- **Batch analysis**: For processing many genomes, use command-line PhiSpy.

---

## Citation

If you use PhiSpyWeb in your research, please cite the original PhiSpy publications:

> Sajia Akhter, Ramy K. Aziz, Robert A. Edwards (2012).
> **PhiSpy: a novel algorithm for finding prophages in bacterial genomes that combines similarity- and composition-based strategies.**
> *Nucleic Acids Research*, 40(16):e126.
> doi: [10.1093/nar/gks406](https://doi.org/10.1093/nar/gks406)

Also see the [PhiSpy repository](https://github.com/linsalrob/PhiSpy) for the more information.

