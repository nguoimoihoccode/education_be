import importlib.util
import pathlib
import unittest
spec = importlib.util.spec_from_file_location('retention', pathlib.Path(__file__).with_name('retain-docker-images.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class RetentionTest(unittest.TestCase):
    def test_keeps_three_unique_images_and_all_container_references(self):
        images = [{'Id':str(i),'Created':f'2026-11-0{i}T00:00:00Z','RepoTags':[f'app:{i}']} for i in range(1,6)]
        self.assertEqual(module.removable_tags(images, 'app', {'1'}, 3), ['app:2'])
    def test_never_removes_another_repository_tag_or_rollback_alias(self):
        images = [{'Id':'1','Created':'1','RepoTags':['app:old','other:old','app:rollback']}, {'Id':'2','Created':'2','RepoTags':['app:new']}]
        self.assertEqual(module.removable_tags(images, 'app', set(), 1), [])
    def test_duplicate_tags_do_not_count_as_separate_images(self):
        images=[{'Id':'1','Created':'1','RepoTags':['app:a','app:b']},{'Id':'2','Created':'2','RepoTags':['app:c']},{'Id':'3','Created':'3','RepoTags':['app:d']}]
        self.assertEqual(module.removable_tags(images,'app',set(),2), ['app:a','app:b'])
if __name__ == '__main__': unittest.main()
