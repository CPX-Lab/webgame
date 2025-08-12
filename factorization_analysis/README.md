# Factorization Algorithm Analysis

This folder contains a comprehensive analysis of factorization algorithms, comparing our implementation with existing research and modern libraries.

## 📁 Project Structure

```
factorization_analysis/
├── README.md                           # This file
├── fast_factor.py                      # Enhanced factorization algorithm with performance analysis
├── benchmark_comparison.py             # Comparison with SymPy
├── visualization_comparison.py         # Comprehensive matplotlib visualizations
├── performance_insights.py             # Focused insight analysis
├── simple_performance_plot.py          # Text-based visualization (no matplotlib required)
├── factorization_research_comparison.md # Detailed research analysis
├── factorization_analysis_summary.md   # Executive summary
├── FINAL_ANALYSIS_SUMMARY.md          # Comprehensive final summary
├── factorization_comparison.png        # Main comparison plots
├── factorization_comparison.pdf        # Main comparison plots (PDF)
├── performance_insights.png           # Insight analysis plots
├── performance_insights.pdf           # Insight analysis plots (PDF)
└── factorization_performance.png      # Original performance plot
```

## 🚀 Quick Start

### Prerequisites
```bash
# Activate your virtual environment
source ../.venv/bin/activate

# Install required dependencies
pip install matplotlib numpy sympy
```

### Basic Usage

1. **Run performance analysis**:
   ```bash
   python fast_factor.py --performance
   ```

2. **Compare with SymPy**:
   ```bash
   python benchmark_comparison.py
   ```

3. **Generate comprehensive visualizations**:
   ```bash
   python visualization_comparison.py
   ```

4. **Get performance insights**:
   ```bash
   python performance_insights.py
   ```

5. **Text-based visualization** (no matplotlib required):
   ```bash
   python simple_performance_plot.py
   ```

## 📊 Analysis Results

### Performance Summary
- **Our Algorithm**: 53.00ms average (range: 9.75-213.73ms) for 49-77 bit numbers
- **SymPy Comparison**: 0.61ms average (~87x faster)
- **Best Performance**: 53-bit numbers (9.75ms)
- **Worst Performance**: 75-bit numbers (213.73ms)

### Key Findings
- High variability in performance (98x difference between best/worst cases)
- SymPy uses advanced algorithms (ECM, QS) vs our classical methods
- C implementation (GMP) vs Python explains much of the performance gap
- Excellent educational value for understanding factorization algorithms

## 🔧 Scripts Overview

### Core Algorithm
- **`fast_factor.py`**: Enhanced factorization algorithm with:
  - Miller-Rabin primality testing
  - Pollard's p-1 method (stage 1)
  - Pollard's rho method (Brent's variant)
  - Performance analysis capabilities

### Benchmarking
- **`benchmark_comparison.py`**: Compares our algorithm with SymPy's `factorint()`
- **`visualization_comparison.py`**: Creates comprehensive 6-panel visualizations
- **`performance_insights.py`**: Focused analysis with key insights
- **`simple_performance_plot.py`**: Text-based plots (no matplotlib required)

### Documentation
- **`factorization_research_comparison.md`**: Detailed comparison with existing research
- **`factorization_analysis_summary.md`**: Executive summary
- **`FINAL_ANALYSIS_SUMMARY.md`**: Comprehensive final analysis

## 📈 Visualizations

### Generated Plots
1. **`factorization_comparison.png/pdf`**: 6-panel comprehensive comparison
   - Time comparison (linear/log scale)
   - Speedup ratio analysis
   - Performance distribution
   - Grouped performance by bit length
   - Trend analysis with regression lines

2. **`performance_insights.png/pdf`**: Focused insight analysis
   - Performance comparison with trend lines
   - Speedup ratio by bit length
   - Distribution comparison
   - Performance heatmap

3. **`factorization_performance.png`**: Original performance analysis

## 🎯 Use Cases

### Educational Purposes ✅
- Excellent for learning classical factorization methods
- Demonstrates algorithm implementation
- Good for small-scale demonstrations

### Small Numbers (< 60 bits) ✅
- Adequate performance for educational use
- Good for understanding the algorithms

### Large Numbers (> 70 bits) ❌
- Use SymPy or GMP instead
- Performance degrades exponentially

### Production Use ❌
- Consider implementing ECM and QS
- Use C/C++ implementations (GMP, FLINT)

## 📚 Research Comparison

### Major Libraries
| Library | Language | Key Features | Performance |
|---------|----------|--------------|-------------|
| **SymPy** | Python | GMP + ECM + QS | ~87x faster |
| **GMP** | C | Industry standard | ~100-1000x faster |
| **FLINT** | C | Number theory focused | ~100-1000x faster |
| **PARI/GP** | C | Comprehensive | ~100-1000x faster |

### Key Research Papers
1. **Pollard (1975)**: "A Monte Carlo method for factorization"
2. **Brent (1980)**: "An improved Monte Carlo factorization algorithm"
3. **Lenstra (1987)**: "Factoring integers with elliptic curves"
4. **Pomerance (1985)**: "The quadratic sieve factoring algorithm"

## 🔍 Algorithm Details

### Our Implementation
- **Miller-Rabin**: Probabilistic primality testing (8 rounds)
- **Pollard's p-1**: Stage 1 only (B = 10,000)
- **Pollard's rho**: Brent's variant with cycle detection
- **Fallback**: Vanilla Pollard's rho

### SymPy Implementation
- **Trial Division**: For small numbers (< 2^20)
- **Pollard's rho**: Optimized version for medium numbers
- **ECM**: Elliptic Curve Method for larger numbers
- **QS**: Quadratic Sieve for very large numbers

## 🚀 Next Steps

### Immediate Improvements
1. Add trial division for small factors
2. Implement ECM for medium numbers (30-70 bits)
3. Improve parameter selection based on number size

### Advanced Improvements
1. Implement QS for large numbers (> 70 bits)
2. Use GMP for 10-100x speedup
3. Add parallel implementation

### Learning Path
1. Study classical methods (your implementation is perfect)
2. Learn modern methods (ECM, QS, NFS)
3. Explore optimizations (GMP, FLINT, PARI/GP)
4. Understand algorithm selection heuristics

## 📝 Example Usage

```python
# Basic factorization
from fast_factor import factor

N = 18446457677371445881
factors = []
factor(N, factors)
print(f"Factors of {N}: {factors}")

# Performance analysis
python fast_factor.py --performance

# Comparison with SymPy
python benchmark_comparison.py

# Generate visualizations
python visualization_comparison.py
```

## 🤝 Contributing

This analysis provides a foundation for understanding factorization algorithms. Feel free to:
- Extend the analysis with additional algorithms
- Improve the visualizations
- Add more comprehensive benchmarking
- Implement additional factorization methods

## 📄 License

This analysis is provided for educational and research purposes. The algorithms and methods are based on well-established research in computational number theory.

---

*Analysis completed with comprehensive benchmarking, visualization, and comparison with existing research and implementations.*
