#!/usr/bin/env python3
# visualization_comparison.py
# Comprehensive matplotlib visualization for factorization algorithm comparison

import time
import random
import matplotlib.pyplot as plt
import numpy as np
from sympy import factorint, primerange
from fast_factor import factor, generate_sample_primes

def run_comprehensive_benchmark(num_samples=25, max_bits=60):
    """Run comprehensive benchmark comparing our algorithm with SymPy"""
    
    print("Running comprehensive benchmark...")
    print("="*60)
    
    # Generate test cases
    prime_pairs = generate_sample_primes(min_bits=25, max_bits=max_bits, num_samples=num_samples)
    
    results = []
    
    for i, (p, q, N) in enumerate(prime_pairs):
        print(f"Testing {i+1}/{len(prime_pairs)}: N = {N} ({N.bit_length()} bits)")
        
        # Test our algorithm
        times_ours = []
        for _ in range(3):
            t0 = time.time()
            fs_ours = []
            factor(N, fs_ours)
            fs_ours.sort()
            t1 = time.time()
            times_ours.append((t1 - t0) * 1000)
        
        # Test SymPy
        times_sympy = []
        for _ in range(3):
            t0 = time.time()
            factors_sympy = factorint(N)
            fs_sympy = []
            for prime, power in factors_sympy.items():
                fs_sympy.extend([prime] * power)
            fs_sympy.sort()
            t1 = time.time()
            times_sympy.append((t1 - t0) * 1000)
        
        # Verify results match
        if fs_ours != fs_sympy:
            print(f"  WARNING: Results don't match!")
            print(f"    Ours: {fs_ours}")
            print(f"    SymPy: {fs_sympy}")
        
        avg_ours = np.mean(times_ours)
        std_ours = np.std(times_ours)
        avg_sympy = np.mean(times_sympy)
        std_sympy = np.std(times_sympy)
        
        results.append({
            'N': N,
            'bit_length': N.bit_length(),
            'ours_time': avg_ours,
            'ours_std': std_ours,
            'sympy_time': avg_sympy,
            'sympy_std': std_sympy,
            'speedup': avg_sympy / avg_ours if avg_ours > 0 else float('inf'),
            'ours_factors': fs_ours,
            'sympy_factors': fs_sympy
        })
        
        print(f"  Ours: {avg_ours:.2f}±{std_ours:.2f} ms, SymPy: {avg_sympy:.2f}±{std_sympy:.2f} ms, Speedup: {avg_sympy/avg_ours:.2f}x")
    
    return results

def create_comprehensive_visualization(results):
    """Create comprehensive matplotlib visualization"""
    
    if not results:
        print("No results to visualize")
        return
    
    # Extract data
    bit_lengths = [r['bit_length'] for r in results]
    ours_times = [r['ours_time'] for r in results]
    sympy_times = [r['sympy_time'] for r in results]
    ours_stds = [r['ours_std'] for r in results]
    sympy_stds = [r['sympy_std'] for r in results]
    speedups = [r['speedup'] for r in results if r['speedup'] != float('inf')]
    
    # Create figure with subplots
    fig = plt.figure(figsize=(16, 12))
    
    # Plot 1: Time comparison (linear scale)
    plt.subplot(2, 3, 1)
    plt.errorbar(bit_lengths, ours_times, yerr=ours_stds, 
                marker='o', label='Our Algorithm', capsize=5, capthick=2, alpha=0.7)
    plt.errorbar(bit_lengths, sympy_times, yerr=sympy_stds, 
                marker='s', label='SymPy', capsize=5, capthick=2, alpha=0.7)
    plt.xlabel('Bit Length of N')
    plt.ylabel('Time (ms)')
    plt.title('Factorization Time Comparison (Linear Scale)')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # Plot 2: Time comparison (log scale)
    plt.subplot(2, 3, 2)
    plt.errorbar(bit_lengths, ours_times, yerr=ours_stds, 
                marker='o', label='Our Algorithm', capsize=5, capthick=2, alpha=0.7)
    plt.errorbar(bit_lengths, sympy_times, yerr=sympy_stds, 
                marker='s', label='SymPy', capsize=5, capthick=2, alpha=0.7)
    plt.yscale('log')
    plt.xlabel('Bit Length of N')
    plt.ylabel('Time (ms) - Log Scale')
    plt.title('Factorization Time Comparison (Log Scale)')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # Plot 3: Speedup ratio
    plt.subplot(2, 3, 3)
    valid_speedups = [(bl, sp) for bl, sp in zip(bit_lengths, speedups) if sp != float('inf')]
    if valid_speedups:
        speedup_bl, speedup_vals = zip(*valid_speedups)
        plt.scatter(speedup_bl, speedup_vals, alpha=0.7, s=50)
        plt.axhline(y=1, color='r', linestyle='--', alpha=0.5, label='Equal Performance')
        plt.xlabel('Bit Length of N')
        plt.ylabel('Speedup Ratio (SymPy / Ours)')
        plt.title('Performance Speedup Ratio')
        plt.legend()
        plt.grid(True, alpha=0.3)
    
    # Plot 4: Performance distribution
    plt.subplot(2, 3, 4)
    plt.hist(ours_times, bins=15, alpha=0.7, label='Our Algorithm', edgecolor='black')
    plt.hist(sympy_times, bins=15, alpha=0.7, label='SymPy', edgecolor='black')
    plt.xlabel('Time (ms)')
    plt.ylabel('Frequency')
    plt.title('Distribution of Factorization Times')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # Plot 5: Performance by bit length (grouped)
    plt.subplot(2, 3, 5)
    bit_groups = {}
    for r in results:
        bl = r['bit_length']
        if bl not in bit_groups:
            bit_groups[bl] = {'ours': [], 'sympy': []}
        bit_groups[bl]['ours'].append(r['ours_time'])
        bit_groups[bl]['sympy'].append(r['sympy_time'])
    
    bit_lengths_grouped = sorted(bit_groups.keys())
    ours_grouped = [np.mean(bit_groups[bl]['ours']) for bl in bit_lengths_grouped]
    sympy_grouped = [np.mean(bit_groups[bl]['sympy']) for bl in bit_lengths_grouped]
    ours_grouped_std = [np.std(bit_groups[bl]['ours']) for bl in bit_lengths_grouped]
    sympy_grouped_std = [np.std(bit_groups[bl]['sympy']) for bl in bit_lengths_grouped]
    
    x_pos = np.arange(len(bit_lengths_grouped))
    width = 0.35
    
    plt.bar(x_pos - width/2, ours_grouped, width, label='Our Algorithm', 
            yerr=ours_grouped_std, capsize=5, alpha=0.7)
    plt.bar(x_pos + width/2, sympy_grouped, width, label='SymPy', 
            yerr=sympy_grouped_std, capsize=5, alpha=0.7)
    
    plt.xlabel('Bit Length')
    plt.ylabel('Average Time (ms)')
    plt.title('Average Performance by Bit Length')
    plt.xticks(x_pos, bit_lengths_grouped)
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # Plot 6: Scatter plot with trend lines
    plt.subplot(2, 3, 6)
    plt.scatter(bit_lengths, ours_times, alpha=0.6, s=50, label='Our Algorithm')
    plt.scatter(bit_lengths, sympy_times, alpha=0.6, s=50, label='SymPy')
    
    # Add trend lines
    if len(bit_lengths) > 1:
        z_ours = np.polyfit(bit_lengths, ours_times, 1)
        p_ours = np.poly1d(z_ours)
        plt.plot(bit_lengths, p_ours(bit_lengths), "r--", alpha=0.8, label='Our Trend')
        
        z_sympy = np.polyfit(bit_lengths, sympy_times, 1)
        p_sympy = np.poly1d(z_sympy)
        plt.plot(bit_lengths, p_sympy(bit_lengths), "b--", alpha=0.8, label='SymPy Trend')
    
    plt.xlabel('Bit Length of N')
    plt.ylabel('Time (ms)')
    plt.title('Performance Trend Analysis')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    # Add summary statistics as text
    fig.suptitle('Factorization Algorithm Performance Comparison', fontsize=16, y=0.98)
    
    # Create summary text
    summary_text = f"""
    Summary Statistics:
    • Total samples: {len(results)}
    • Bit length range: {min(bit_lengths)} - {max(bit_lengths)} bits
    • Our algorithm: {np.mean(ours_times):.2f} ± {np.std(ours_times):.2f} ms
    • SymPy: {np.mean(sympy_times):.2f} ± {np.std(sympy_times):.2f} ms
    • Average speedup: {np.mean(speedups):.2f}x
    • Best speedup: {max(speedups):.2f}x
    • Worst speedup: {min(speedups):.2f}x
    """
    
    plt.figtext(0.02, 0.02, summary_text, fontsize=10, 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray", alpha=0.8))
    
    return fig

def print_detailed_statistics(results):
    """Print detailed statistics"""
    
    print("\n" + "="*60)
    print("DETAILED STATISTICS")
    print("="*60)
    
    if not results:
        print("No results to analyze")
        return
    
    # Overall statistics
    ours_times = [r['ours_time'] for r in results]
    sympy_times = [r['sympy_time'] for r in results]
    speedups = [r['speedup'] for r in results if r['speedup'] != float('inf')]
    
    print(f"Total samples: {len(results)}")
    print(f"Bit length range: {min(r['bit_length'] for r in results)} - {max(r['bit_length'] for r in results)} bits")
    print()
    
    print("OUR ALGORITHM:")
    print(f"  Average time: {np.mean(ours_times):.2f} ± {np.std(ours_times):.2f} ms")
    print(f"  Median time: {np.median(ours_times):.2f} ms")
    print(f"  Min time: {min(ours_times):.2f} ms")
    print(f"  Max time: {max(ours_times):.2f} ms")
    print(f"  Coefficient of variation: {np.std(ours_times)/np.mean(ours_times):.3f}")
    print()
    
    print("SYMPY FACTORINT:")
    print(f"  Average time: {np.mean(sympy_times):.2f} ± {np.std(sympy_times):.2f} ms")
    print(f"  Median time: {np.median(sympy_times):.2f} ms")
    print(f"  Min time: {min(sympy_times):.2f} ms")
    print(f"  Max time: {max(sympy_times):.2f} ms")
    print(f"  Coefficient of variation: {np.std(sympy_times)/np.mean(sympy_times):.3f}")
    print()
    
    print("PERFORMANCE COMPARISON:")
    print(f"  Average speedup: {np.mean(speedups):.2f}x")
    print(f"  Median speedup: {np.median(speedups):.2f}x")
    print(f"  Best speedup: {max(speedups):.2f}x")
    print(f"  Worst speedup: {min(speedups):.2f}x")
    print(f"  Speedup std dev: {np.std(speedups):.2f}x")
    
    # Performance by bit length
    print("\nPerformance by bit length:")
    bit_groups = {}
    for r in results:
        bl = r['bit_length']
        if bl not in bit_groups:
            bit_groups[bl] = []
        bit_groups[bl].append(r)
    
    for bl in sorted(bit_groups.keys()):
        group = bit_groups[bl]
        avg_ours = np.mean([r['ours_time'] for r in group])
        avg_sympy = np.mean([r['sympy_time'] for r in group])
        avg_speedup = avg_sympy / avg_ours
        print(f"  {bl} bits: Ours={avg_ours:.2f}ms, SymPy={avg_sympy:.2f}ms, Speedup={avg_speedup:.2f}x (n={len(group)})")

def main():
    """Main function to run comprehensive analysis and visualization"""
    
    print("Starting comprehensive factorization algorithm comparison...")
    print("="*60)
    
    # Run benchmark
    results = run_comprehensive_benchmark(num_samples=20, max_bits=55)
    
    # Print statistics
    print_detailed_statistics(results)
    
    # Create visualization
    print("\nCreating comprehensive visualization...")
    fig = create_comprehensive_visualization(results)
    
    # Save and show plot
    plt.savefig('factorization_comparison.png', dpi=300, bbox_inches='tight')
    plt.savefig('factorization_comparison.pdf', bbox_inches='tight')
    print("Plots saved as 'factorization_comparison.png' and 'factorization_comparison.pdf'")
    
    plt.show()
    
    return results

if __name__ == "__main__":
    main()
