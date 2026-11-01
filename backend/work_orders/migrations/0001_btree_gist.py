from django.contrib.postgres.operations import BtreeGistExtension
from django.db import migrations


class Migration(migrations.Migration):
    """Needed by the exclusion constraint that forbids overlapping assignments (generated migrations come after this)."""

    dependencies = []
    operations = [BtreeGistExtension()]
