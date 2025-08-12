#!/usr/bin/env python3
# benchmark_ultra.py
# Comprehensive benchmarking of ultra-optimized factorization algorithm

import time
import random
import numpy as np
import matplotlib.pyplot as plt
from sympy import factorint, primerange
from ultra_factor import ultra_factor
import sys
import os

# Add the factorization_analysis folder to path to import the original algorithm
sys.path.append('../factorization_analysis')
from fast_factor import factor as original_factor

def generate_test_cases(min_bits=20, max_bits=80, num_samples=30):
    """Generate diverse test cases for benchmarking"""
    print(f"Generating {num_samples} test cases from {min_bits} to {max_bits} bits...")
    
    test_cases = []
    
    # Generate semiprimes of different sizes
    for bits in range(min_bits, max_bits + 1, 5):
        samples_per_range = max(1, num_samples // ((max_bits - min_bits) // 5 + 1))
        
        for _ in range(samples_per_range):
            # Generate two primes in the same bit range
            min_val = 2**(bits//2 - 1)
            max_val = 2**(bits//2) - 1
            
            # Get primes in this range
            range_primes = list(primerange(min_val, min(max_val, min_val + 100000)))
            
            if len(range_primes) >= 2:
                p = random.choice(range_primes)
                q = random.choice(range_primes)
                if p != q:
                    N = p * q
                    if min_bits <= N.bit_length() <= max_bits:
                        test_cases.append((N, p, q))
    
    # Add some special cases
    special_cases = [
        (1000000007, 1000000007, 1),  # Prime
        (1000000009, 1000000009, 1),  # Prime
        (999999937, 999999937, 1),    # Prime
        (18446457677371445881, 4294954943, 4294912967),  # Known semiprime
    ]
    
    test_cases.extend(special_cases)
    
    return test_cases[:num_samples]

def benchmark_algorithms(test_cases, num_trials=3):
    """Benchmark all three algorithms"""
    print(f"Benchmarking {len(test_cases)} test cases with {num_trials} trials each...")
    print("=" * 80)
    
    results = []
    
    for i, (N, p, q) in enumerate(test_cases):
        print(f"Test {i+1}/{len(test_cases)}: N = {N} ({N.bit_length()} bits)")
        
        # Test Ultra-Optimized Algorithm
        ultra_times = []
        for trial in range(num_trials):
            t0 = time.time()
            factors_ultra = []
            ultra_factor(N, factors_ultra)
            factors_ultra.sort()
            t1 = time.time()
            ultra_times.append((t1 - t0) * 1000)
        
        # Test Original Algorithm
        original_times = []
        for trial in range(num_trials):
            t0 = time.time()
            factors_original = []
            original_factor(N, factors_original)
            factors_original.sort()
            t1 = time.time()
            original_times.append((t1 - t0) * 1000)
        
        # Test SymPy
        sympy_times = []
        for trial in range(num_trials):
            t0 = time.time()
            factors_sympy = factorint(N)
            sympy_list = []
            for prime, power in factors_sympy.items():
                sympy_list.extend([prime] * power)
            sympy_list.sort()
            t1 = time.time()
            sympy_times.append((t1 - t0) * 1000)
        
        # Verify results
        ultra_product = 1
        for f in factors_ultra:
            ultra_product *= f
        
        original_product = 1
        for f in factors_original:
            original_product *= f
        
        # Calculate statistics
        ultra_avg = np.mean(ultra_times)
        ultra_std = np.std(ultra_times)
        original_avg = np.mean(original_times)
        original_std = np.std(original_times)
        sympy_avg = np.mean(sympy_times)
        sympy_std = np.std(sympy_times)
        
        # Calculate speedups
        ultra_vs_sympy = sympy_avg / ultra_avg if ultra_avg > 0 else float('inf')
        ultra_vs_original = original_avg / ultra_avg if ultra_avg > 0 else float('inf')
        
        results.append({
            'N': N,
            'p': p,
            'q': q,
            'bit_length': N.bit_length(),
            'ultra_time': ultra_avg,
            'ultra_std': ultra_std,
            'original_time': original_avg,
            'original_std': original_std,
            'sympy_time': sympy_avg,
            'sympy_std': sympy_std,
            'ultra_vs_sympy': ultra_vs_sympy,
            'ultra_vs_original': ultra_vs_original,
            'ultra_correct': ultra_product == N,
            'original_correct': original_product == N,
            'factors_match': factors_ultra == factors_original == sympy_list,
            'ultra_factors': factors_ultra,
            'original_factors': factors_original,
            'sympy_factors': sympy_list
        })
        
        print(f"  Ultra: {ultra_avg:.2f}±{ultra_std:.2f} ms")
        print(f"  Original: {original_avg:.2f}±{original_std:.2f} ms")
        print(f"  SymPy: {sympy_avg:.2f}±{sympy_std:.2f} ms")
        print(f"  Ultra vs SymPy: {ultra_vs_sympy:.2f}x")
        print(f"  Ultra vs Original: {ultra_vs_original:.2f}x")
        print(f"  Correct: {ultra_product == N}")
        print()
    
    return results

def create_comprehensive_visualization(results):
    """Create comprehensive visualization comparing all three algorithms"""
    
    if not results:
        print("No results to visualize")
        return
    
    # Extract data
    bit_lengths = [r['bit_length'] for r in results]
    ultra_times = [r['ultra_time'] for r in results]
    original_times = [r['original_time'] for r in results]
    sympy_times = [r['sympy_time'] for r in results]
    
    # Create figure with subplots
    fig = plt.figure(figsize=(18, 12))
    
    # Plot 1: Time comparison (linear scale)
    plt.subplot(2, 3, 1)
    plt.scatter(bit_lengths, ultra_times, alpha=0.7, s=60, label='Ultra-Optimized', color='red')
    plt.scatter(bit_lengths, original_times, alpha=0.7, s=60, label='Original', color='blue')
    plt.scatter(bit_lengths, sympy_times, alpha=0.7, s=60, label='SymPy', color='green')
    plt.xlabel('Bit Length of N')
    plt.ylabel('Time (ms)')
    plt.title('Factorization Time Comparison (Linear Scale)')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # Plot 2: Time comparison (log scale)
    plt.subplot(2, 3, 2)
    plt.scatter(bit_lengths, ultra_times, alpha=0.7, s=60, label='Ultra-Optimized', color='red')
    plt.scatter(bit_lengths, original_times, alpha=0.7, s=60, label='Original', color='blue')
    plt.scatter(bit_lengths, sympy_times, alpha=0.7, s=60, label='SymPy', color='green')
    plt.yscale('log')
    plt.xlabel('Bit Length of N')
    plt.ylabel('Time (ms) - Log Scale')
    plt.title('Factorization Time Comparison (Log Scale)')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # Plot 3: Speedup comparison
    plt.subplot(2, 3, 3)
    ultra_vs_sympy = [r['ultra_vs_sympy'] for r in results if r['ultra_vs_sympy'] != float('inf')]
    ultra_vs_original = [r['ultra_vs_original'] for r in results if r['ultra_vs_original'] != float('inf')]
    
    if ultra_vs_sympy:
        plt.scatter(bit_lengths[:len(ultra_vs_sympy)], ultra_vs_sympy, alpha=0.7, s=60, 
                   label='Ultra vs SymPy', color='purple')
    if ultra_vs_original:
        plt.scatter(bit_lengths[:len(ultra_vs_original)], ultra_vs_original, alpha=0.7, s=60, 
                   label='Ultra vs Original', color='orange')
    
    plt.axhline(y=1, color='black', linestyle='--', alpha=0.5, label='Equal Performance')
    plt.xlabel('Bit Length of N')
    plt.ylabel('Speedup Ratio')
    plt.title('Performance Speedup Comparison')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # Plot 4: Performance distribution
    plt.subplot(2, 3, 4)
    plt.hist(ultra_times, bins=15, alpha=0.7, label='Ultra-Optimized', color='red', edgecolor='black')
    plt.hist(original_times, bins=15, alpha=0.7, label='Original', color='blue', edgecolor='black')
    plt.hist(sympy_times, bins=15, alpha=0.7, label='SymPy', color='green', edgecolor='black')
    plt.xlabel('Time (ms)')
    plt.ylabel('Frequency')
    plt.title('Distribution of Factorization Times')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.xscale('log')
    
    # Plot 5: Performance by bit length (grouped)
    plt.subplot(2, 3, 5)
    bit_groups = {}
    for r in results:
        bl = r['bit_length']
        if bl not in bit_groups:
            bit_groups[bl] = {'ultra': [], 'original': [], 'sympy': []}
        bit_groups[bl]['ultra'].append(r['ultra_time'])
        bit_groups[bl]['original'].append(r['original_time'])
        bit_groups[bl]['sympy'].append(r['sympy_time'])
    
    bit_lengths_grouped = sorted(bit_groups.keys())
    ultra_grouped = [np.mean(bit_groups[bl]['ultra']) for bl in bit_lengths_grouped]
    original_grouped = [np.mean(bit_groups[bl]['original']) for bl in bit_lengths_grouped]
    sympy_grouped = [np.mean(bit_groups[bl]['sympy']) for bl in bit_lengths_grouped]
    
    x_pos = np.arange(len(bit_lengths_grouped))
    width = 0.25
    
    plt.bar(x_pos - width, ultra_grouped, width, label='Ultra-Optimized', alpha=0.7)
    plt.bar(x_pos, original_grouped, width, label='Original', alpha=0.7)
    plt.bar(x_pos + width, sympy_grouped, width, label='SymPy', alpha=0.7)
    
    plt.xlabel('Bit Length')
    plt.ylabel('Average Time (ms)')
    plt.title('Average Performance by Bit Length')
    plt.xticks(x_pos, bit_lengths_grouped)
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.yscale('log')
    
    # Plot 6: Success rate and correctness
    plt.subplot(2, 3, 6)
    ultra_correct = sum(1 for r in results if r['ultra_correct'])
    original_correct = sum(1 for r in results if r['original_correct'])
    factors_match = sum(1 for r in results if r['factors_match'])
    
    categories = ['Ultra Correct', 'Original Correct', 'Factors Match']
    values = [ultra_correct, original_correct, factors_match]
    colors = ['red', 'blue', 'green']
    
    bars = plt.bar(categories, values, color=colors, alpha=0.7)
    plt.ylabel('Count')
    plt.title('Correctness Comparison')
    plt.ylim(0, len(results))
    
    # Add value labels on bars
    for bar, value in zip(bars, values):
        plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5, 
                str(value), ha='center', va='bottom')
    
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    # Add summary statistics
    summary_text = f"""
    Summary Statistics:
    • Total samples: {len(results)}
    • Bit length range: {min(bit_lengths)} - {max(bit_lengths)} bits
    • Ultra-Optimized: {np.mean(ultra_times):.2f} ± {np.std(ultra_times):.2f} ms
    • Original: {np.mean(original_times):.2f} ± {np.std(original_times):.2f} ms
    • SymPy: {np.mean(sympy_times):.2f} ± {np.std(sympy_times):.2f} ms
    • Ultra vs SymPy: {np.mean([r['ultra_vs_sympy'] for r in results if r['ultra_vs_sympy'] != float('inf')]):.2f}x
    • Ultra vs Original: {np.mean([r['ultra_vs_original'] for r in results if r['ultra_vs_original'] != float('inf')]):.2f}x
    """
    
    fig.suptitle('Ultra-Optimized Factorization Algorithm Performance Analysis', fontsize=16, y=0.98)
    plt.figtext(0.02, 0.02, summary_text, fontsize=10, 
                bbox=dict(boxstyle="round,pad=0.3", facecolor="lightyellow", alpha=0.8))
    
    return fig

def print_detailed_statistics(results):
    """Print detailed statistics"""
    
    print("\n" + "="*80)
    print("DETAILED PERFORMANCE STATISTICS")
    print("="*80)
    
    if not results:
        print("No results to analyze")
        return
    
    # Overall statistics
    ultra_times = [r['ultra_time'] for r in results]
    original_times = [r['original_time'] for r in results]
    sympy_times = [r['sympy_time'] for r in results]
    
    ultra_vs_sympy = [r['ultra_vs_sympy'] for r in results if r['ultra_vs_sympy'] != float('inf')]
    ultra_vs_original = [r['ultra_vs_original'] for r in results if r['ultra_vs_original'] != float('inf')]
    
    print(f"Total samples: {len(results)}")
    print(f"Bit length range: {min(r['bit_length'] for r in results)} - {max(r['bit_length'] for r in results)} bits")
    print()
    
    print("ULTRA-OPTIMIZED ALGORITHM:")
    print(f"  Average time: {np.mean(ultra_times):.2f} ± {np.std(ultra_times):.2f} ms")
    print(f"  Median time: {np.median(ultra_times):.2f} ms")
    print(f"  Min time: {min(ultra_times):.2f} ms")
    print(f"  Max time: {max(ultra_times):.2f} ms")
    print(f"  Correctness: {sum(1 for r in results if r['ultra_correct'])}/{len(results)}")
    print()
    
    print("ORIGINAL ALGORITHM:")
    print(f"  Average time: {np.mean(original_times):.2f} ± {np.std(original_times):.2f} ms")
    print(f"  Median time: {np.median(original_times):.2f} ms")
    print(f"  Min time: {min(original_times):.2f} ms")
    print(f"  Max time: {max(original_times):.2f} ms")
    print(f"  Correctness: {sum(1 for r in results if r['original_correct'])}/{len(results)}")
    print()
    
    print("SYMPY:")
    print(f"  Average time: {np.mean(sympy_times):.2f} ± {np.std(sympy_times):.2f} ms")
    print(f"  Median time: {np.median(sympy_times):.2f} ms")
    print(f"  Min time: {min(sympy_times):.2f} ms")
    print(f"  Max time: {max(sympy_times):.2f} ms")
    print()
    
    print("PERFORMANCE COMPARISON:")
    if ultra_vs_sympy:
        print(f"  Ultra vs SymPy: {np.mean(ultra_vs_sympy):.2f}x average speedup")
        print(f"  Best Ultra vs SymPy: {max(ultra_vs_sympy):.2f}x")
        print(f"  Worst Ultra vs SymPy: {min(ultra_vs_sympy):.2f}x")
    if ultra_vs_original:
        print(f"  Ultra vs Original: {np.mean(ultra_vs_original):.2f}x average speedup")
        print(f"  Best Ultra vs Original: {max(ultra_vs_original):.2f}x")
        print(f"  Worst Ultra vs Original: {min(ultra_vs_original):.2f}x")
    
    print(f"  Factors match: {sum(1 for r in results if r['factors_match'])}/{len(results)}")
    
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
        avg_ultra = np.mean([r['ultra_time'] for r in group])
        avg_original = np.mean([r['original_time'] for r in group])
        avg_sympy = np.mean([r['sympy_time'] for r in group])
        avg_speedup = avg_sympy / avg_ultra if avg_ultra > 0 else float('inf')
        print(f"  {bl} bits: Ultra={avg_ultra:.2f}ms, Original={avg_original:.2f}ms, SymPy={avg_sympy:.2f}ms, Speedup={avg_speedup:.2f}x (n={len(group)})")

def main():
    """Main function"""
    print("Ultra-Optimized Factorization Algorithm Benchmarking")
    print("=" * 80)
    
    # Generate test cases
    test_cases = generate_test_cases(min_bits=25, max_bits=70, num_samples=25)
    
    # Run benchmark
    results = benchmark_algorithms(test_cases, num_trials=3)
    
    # Print statistics
    print_detailed_statistics(results)
    
    # Create visualization
    print("\nCreating comprehensive visualization...")
    fig = create_comprehensive_visualization(results)
    
    # Save plots
    plt.savefig('ultra_factorization_benchmark.png', dpi=300, bbox_inches='tight')
    plt.savefig('ultra_factorization_benchmark.pdf', bbox_inches='tight')
    print("Plots saved as 'ultra_factorization_benchmark.png' and 'ultra_factorization_benchmark.pdf'")
    
    plt.show()
    
    return results

if __name__ == "__main__":
    main()
