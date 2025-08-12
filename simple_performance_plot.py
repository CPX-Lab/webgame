#!/usr/bin/env python3
# simple_performance_plot.py
# Simple text-based performance visualization

import time
import random
from sympy import primerange
from fast_factor import factor, generate_sample_primes

def create_text_plot(data, title, width=60, height=20):
    """Create a simple text-based plot"""
    if not data:
        return "No data to plot"
    
    x_values = [d['bit_length'] for d in data]
    y_values = [d['avg_time_ms'] for d in data]
    
    min_x, max_x = min(x_values), max(x_values)
    min_y, max_y = min(y_values), max(y_values)
    
    # Create plot grid
    plot = [[' ' for _ in range(width)] for _ in range(height)]
    
    # Plot points
    for x, y in zip(x_values, y_values):
        if max_x == min_x:
            plot_x = width // 2
        else:
            plot_x = int((x - min_x) / (max_x - min_x) * (width - 1))
        
        if max_y == min_y:
            plot_y = height // 2
        else:
            plot_y = int((y - min_y) / (max_y - min_y) * (height - 1))
            plot_y = height - 1 - plot_y  # Flip Y axis
        
        if 0 <= plot_x < width and 0 <= plot_y < height:
            plot[plot_y][plot_x] = '*'
    
    # Add axes
    for i in range(height):
        plot[i][0] = '|'
    for j in range(width):
        plot[height-1][j] = '-'
    
    # Create output
    output = [title]
    output.append("=" * len(title))
    output.append("")
    
    for row in plot:
        output.append(''.join(row))
    
    output.append("")
    output.append(f"X-axis: Bit length ({min_x} - {max_x})")
    output.append(f"Y-axis: Time in ms ({min_y:.1f} - {max_y:.1f})")
    
    return '\n'.join(output)

def run_simple_analysis():
    """Run analysis and create text plots"""
    print("Running simple performance analysis...")
    print("="*60)
    
    # Generate test data
    prime_pairs = generate_sample_primes(min_bits=20, max_bits=40, num_samples=20)
    
    results = []
    for i, (p, q, N) in enumerate(prime_pairs):
        print(f"Testing {i+1}/{len(prime_pairs)}: {N.bit_length()} bits")
        
        times = []
        for _ in range(3):
            t0 = time.time()
            fs = []
            factor(N, fs)
            t1 = time.time()
            times.append((t1 - t0) * 1000)
        
        avg_time = sum(times) / len(times)
        results.append({
            'N': N,
            'bit_length': N.bit_length(),
            'avg_time_ms': avg_time,
            'times': times
        })
    
    # Create text plot
    plot = create_text_plot(results, "Factorization Performance vs Bit Length")
    print("\n" + plot)
    
    # Print statistics
    print("\n" + "="*60)
    print("PERFORMANCE STATISTICS")
    print("="*60)
    
    bit_lengths = [r['bit_length'] for r in results]
    times = [r['avg_time_ms'] for r in results]
    
    print(f"Total samples: {len(results)}")
    print(f"Bit length range: {min(bit_lengths)} - {max(bit_lengths)} bits")
    print(f"Average time: {sum(times)/len(times):.2f} ms")
    print(f"Median time: {sorted(times)[len(times)//2]:.2f} ms")
    print(f"Min time: {min(times):.2f} ms")
    print(f"Max time: {max(times):.2f} ms")
    
    # Group by bit length
    print("\nPerformance by bit length:")
    bit_groups = {}
    for r in results:
        bl = r['bit_length']
        if bl not in bit_groups:
            bit_groups[bl] = []
        bit_groups[bl].append(r['avg_time_ms'])
    
    for bl in sorted(bit_groups.keys()):
        times_group = bit_groups[bl]
        avg_time = sum(times_group) / len(times_group)
        print(f"  {bl} bits: {avg_time:.2f} ms (n={len(times_group)})")
    
    return results

if __name__ == "__main__":
    run_simple_analysis()
