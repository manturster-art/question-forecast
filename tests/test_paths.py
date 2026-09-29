from dcc import paths


def test_paths_are_under_root():
    for p in (paths.WORK, paths.OUT, paths.CONFIG, paths.DATA):
        assert paths.ROOT in p.parents


def test_config_copies_exist():
    assert (paths.CONFIG / '별칭.json').exists()
    assert (paths.CONFIG / '행정기구.json').exists()
    assert paths.SAMPLE.exists()
