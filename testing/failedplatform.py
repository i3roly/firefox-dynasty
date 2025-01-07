# -*- coding: utf-8 -*-"
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

from functools import reduce
from typing import Dict, Set


class FailedPlatform:
    """
    Stores all failures on different build types and test variants for a single platform.
    This allows us to detect when a platform failed on all build types or all test variants to
    generate a simpler skip-if condition.
    """

    def __init__(
        self,
        # Keys are build types, values are test variants for this build type
        # Tests variants can be composite by using the "+" character
        # eg: a11y_checks+swgl
        # See examples in
        # https://firefox-ci-tc.services.mozilla.com/api/index/v1/task/gecko.v2.mozilla-central.latest.source.test-info-all/artifacts/public%2Ftest-info-testrun-matrix.json
        oop_permutations: Dict[str, list[str]],
    ) -> None:
        # Contains all test variants for each build type the task failed on
        self.failures: Dict[str, Set[str]] = {}
        self.oop_permutations = oop_permutations

    def get_possible_build_types(self) -> list[str]:
        return list(self.oop_permutations.keys())

    def get_possible_test_variants(self, build_type: str) -> list[str]:
        return self.oop_permutations.get(build_type, [])

    def is_full_fail(self) -> bool:
        """
        Test if failed on every test variant of every build type
        """
        build_types = set(self.failures.keys())
        return all(
            [
                bt in build_types and self.is_full_test_variants_fail(bt)
                for bt in self.get_possible_build_types()
            ]
        )

    def is_full_test_variants_fail(self, build_type: str) -> bool:
        """
        Test if failed on every test variant of given build type
        """
        failed_variants = self.failures.get(build_type, [])
        return all(
            [t in failed_variants for t in self.get_possible_test_variants(build_type)]
        )

    def get_cleaned_build_type(self, build_types: list[str]) -> str:
        """
        Converts the list of build types describing the task to a single build type
        to be used in the skip-if condition.
        If after cleaning there are more than 1 build type available, raise an error.
        """
        filtered_types = [
            b for b in build_types if b in self.get_possible_build_types()
        ]
        # Some build types like "asan" are also "opt"
        # We only want to add the "opt" skip condition if it is the only type present
        if "opt" in filtered_types and len(filtered_types) > 1:
            filtered_types.remove("opt")
        if len(filtered_types) == 0:
            raise ValueError(f"Could not get valid build type from {str(build_types)}")
        if len(filtered_types) > 1:
            raise ValueError(
                f"Expected a single build type after cleaning, got {str(filtered_types)}"
            )
        return filtered_types[0]

    def get_negated_variant(self, test_variant: str):
        if not test_variant.startswith("!"):
            return "!" + test_variant
        return test_variant.replace("!", "", 1)

    def get_no_variant_conditions(self, and_str: str, build_type: str):
        """
        The no_variant test variant does not really exist and is only internal.
        This function gets all available test variants for the given build type
        and negates them to create a skip-if that handle tasks without test variants
        """
        variants = [
            tv
            for tv in self.get_possible_test_variants(build_type)
            if tv != "no_variant"
        ]
        return_str = ""
        for tv in variants:
            return_str += and_str + self.get_negated_variant(tv)
        return return_str

    def get_test_variant_condition(
        self, and_str: str, build_type: str, test_variant: str
    ):
        """
        If the given test variant is part of another composite test variant, then add negations matching that composite
        variant to prevent overlapping in skips.
        eg: test variant "a11y_checks" is to be added while "a11y_checks+swgl" exists
        the resulting condition will be "a11y_checks && !swgl"
        """
        all_test_variants_parts = [
            tv.split("+")
            for tv in self.get_possible_test_variants(build_type)
            if tv != "no_variant" and tv != test_variant
        ]
        test_variant_parts = test_variant.split("+")
        # List of composite test variants more specific than the current one
        matching_variants_parts = [
            tv_parts
            for tv_parts in all_test_variants_parts
            if all(x in tv_parts for x in test_variant_parts)
        ]
        variants_to_negate = [
            part
            for tv_parts in matching_variants_parts
            for part in tv_parts
            if part not in test_variant_parts
        ]

        return_str = reduce((lambda x, y: x + and_str + y), test_variant_parts, "")
        return_str = reduce(
            (lambda x, y: x + and_str + self.get_negated_variant(y)),
            variants_to_negate,
            return_str,
        )
        return return_str

    def get_test_variant_string(self, test_variant: str):
        """
        Some test variants strings need to be updated to match what is given in oop_permutations
        """
        if test_variant == "no-fission":
            return "!fission"
        return test_variant

    def get_cleaned_test_variant(
        self, build_type: str, test_variants: list[str]
    ) -> str:
        """
        Convert the test variants array into a string compatible with the test variants described in oop_permutations
        """
        if len(test_variants) == 0:
            return "no_variant"

        converted_variants = [self.get_test_variant_string(t) for t in test_variants]
        # When several variants are present, combine them with a '+'
        reduced_variant = reduce((lambda x, y: x + "+" + y), converted_variants)
        if reduced_variant not in self.get_possible_test_variants(build_type):
            return "no_variant"
        return reduced_variant

    def get_skip_string(
        self, and_str: str, build_types: list[str], test_variants: list[str]
    ) -> str:
        cleaned_build_type = self.get_cleaned_build_type(build_types)
        cleaned_variant = self.get_cleaned_test_variant(
            cleaned_build_type, test_variants
        )
        if self.failures.get(cleaned_build_type) is None:
            self.failures[cleaned_build_type] = {cleaned_variant}
        else:
            self.failures[cleaned_build_type].add(cleaned_variant)

        return_str = ""
        # If every test variant of every build type failed, do not add anything
        if not self.is_full_fail():
            return_str += and_str + cleaned_build_type
            if not self.is_full_test_variants_fail(cleaned_build_type):
                cleaned_variant = self.get_cleaned_test_variant(
                    cleaned_build_type, test_variants
                )
                if cleaned_variant == "no_variant":
                    return_str += self.get_no_variant_conditions(
                        and_str, cleaned_build_type
                    )
                else:
                    return_str += self.get_test_variant_condition(
                        and_str, cleaned_build_type, cleaned_variant
                    )

        return return_str
