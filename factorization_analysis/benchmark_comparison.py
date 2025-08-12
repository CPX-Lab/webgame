#!/usr/bin/env python3
# benchmark_comparison.py
# Compare our factorization algorithm with SymPy's implementation

import time
import random
from sympy import factorint, primerange
from fast_factor import factor, generate_sample_primes

def benchmark_comparison(num_samples=20, max_bits=50):
    """Compare our algorithm with SymPy's factorint"""
    
    print("Benchmarking factorization algorithms...")
    print("="*60)
    
    # Generate test cases
    prime_pairs = generate_sample_primes(min_bits=30, max_bits=max_bits, num_samples=num_samples)
    
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
        
        avg_ours = sum(times_ours) / len(times_ours)
        avg_sympy = sum(times_sympy) / len(times_sympy)
        
        results.append({
            'N': N,
            'bit_length': N.bit_length(),
            'ours_time': avg_ours,
            'sympy_time': avg_sympy,
            'speedup': avg_sympy / avg_ours if avg_ours > 0 else float('inf'),
            'ours_factors': fs_ours,
            'sympy_factors': fs_sympy
        })
        
        print(f"  Ours: {avg_ours:.2f} ms, SymPy: {avg_sympy:.2f} ms, Speedup: {avg_sympy/avg_ours:.2f}x")
    
    return results

def print_comparison_summary(results):
    """Print detailed comparison summary"""
    
    print("\n" + "="*60)
    print("COMPARISON SUMMARY")
    print("="*60)
    
    if not results:
        print("No results to compare")
        return
    
    # Overall statistics
    ours_times = [r['ours_time'] for r in results]
    sympy_times = [r['sympy_time'] for r in results]
    speedups = [r['speedup'] for r in results if r['speedup'] != float('inf')]
    
    print(f"Total samples: {len(results)}")
    print(f"Bit length range: {min(r['bit_length'] for r in results)} - {max(r['bit_length'] for r in results)} bits")
    print()
    
    print("OUR ALGORITHM:")
    print(f"  Average time: {sum(ours_times)/len(ours_times):.2f} ms")
    print(f"  Median time: {sorted(ours_times)[len(ours_times)//2]:.2f} ms")
    print(f"  Min time: {min(ours_times):.2f} ms")
    print(f"  Max time: {max(ours_times):.2f} ms")
    print()
    
    print("SYMPY FACTORINT:")
    print(f"  Average time: {sum(sympy_times)/len(sympy_times):.2f} ms")
    print(f"  Median time: {sorted(sympy_times)[len(sympy_times)//2]:.2f} ms")
    print(f"  Min time: {min(sympy_times):.2f} ms")
    print(f"  Max time: {max(sympy_times):.2f} ms")
    print()
    
    print("PERFORMANCE COMPARISON:")
    print(f"  Average speedup: {sum(speedups)/len(speedups):.2f}x")
    print(f"  Median speedup: {sorted(speedups)[len(speedups)//2]:.2f}x")
    print(f"  Best speedup: {max(speedups):.2f}x")
    print(f"  Worst speedup: {min(speedups):.2f}x")
    
    # Group by bit length
    print("\nPerformance by bit length:")
    bit_groups = {}
    for r in results:
        bl = r['bit_length']
        if bl not in bit_groups:
            bit_groups[bl] = []
        bit_groups[bl].append(r)
    
    for bl in sorted(bit_groups.keys()):
        group = bit_groups[bl]
        avg_ours = sum(r['ours_time'] for r in group) / len(group)
        avg_sympy = sum(r['sympy_time'] for r in group) / len(group)
        avg_speedup = avg_sympy / avg_ours
        print(f"  {bl} bits: Ours={avg_ours:.2f}ms, SymPy={avg_sympy:.2f}ms, Speedup={avg_speedup:.2f}x (n={len(group)})")

def main():
    # Run comparison
    results = benchmark_comparison(num_samples=15, max_bits=45)
    print_comparison_summary(results)

if __name__ == "__main__":
    main()
